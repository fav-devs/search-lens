import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { type LensIndex, loadIndex, search } from "./lens-index";
import { embedImage, embedText, loadModel, modelPresent } from "./model";
import { cropToGuide } from "./photo";
import { CameraScreen } from "./screens/CameraScreen";
import { type Result, ResultsScreen } from "./screens/ResultsScreen";
import { SetupScreen } from "./screens/SetupScreen";

export type ModelState =
	| { state: "missing" }
	| { state: "downloading"; progress: number }
	| { state: "loading" }
	| { state: "ready"; backend: string }
	| { state: "error"; message: string };

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export default function App() {
	const [modelOnDisk, setModelOnDisk] = useState(modelPresent);
	const [model, setModel] = useState<ModelState>({ state: modelOnDisk ? "loading" : "missing" });
	const [index, setIndex] = useState<LensIndex | null>(null);
	const [indexRead, setIndexRead] = useState(false);
	const [screen, setScreen] = useState<"camera" | "setup" | "results">("camera");
	const [result, setResult] = useState<Result | null>(null);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		loadIndex()
			.then(setIndex, (error) => Alert.alert("Couldn't read the saved index", message(error)))
			.finally(() => setIndexRead(true));
	}, []);

	// The model has to look at photos with the same number of vision tokens the PC used for the catalogue, so it is
	// (re)loaded once the index is known; loading again with the same settings costs nothing.
	const visionTokens = index?.manifest.visionTokens ?? 140;
	useEffect(() => {
		if (!indexRead || !modelOnDisk) return;
		let cancelled = false;
		setModel({ state: "loading" });
		loadModel(visionTokens).then(
			({ backend }) => !cancelled && setModel({ state: "ready", backend }),
			(error) => !cancelled && setModel({ state: "error", message: message(error) }),
		);
		return () => {
			cancelled = true;
		};
	}, [indexRead, modelOnDisk, visionTokens]);

	const run = useCallback(
		async (prepare: (dims: number) => Promise<{ query: Result["query"]; vector: number[]; prepareMs: number }>) => {
			if (!index) return;
			setBusy(true);
			try {
				const started = Date.now();
				const { query, vector, prepareMs } = await prepare(index.manifest.dims);
				const modelMs = Date.now() - started - prepareMs;
				const searchStarted = Date.now();
				const hits = search(index, vector, 12);
				setResult({ query, hits, timings: { prepareMs, modelMs, searchMs: Date.now() - searchStarted } });
				setScreen("results");
			} catch (error) {
				Alert.alert("Search failed", message(error));
			} finally {
				setBusy(false);
			}
		},
		[index],
	);

	const onPhoto = useCallback(
		(uri: string, view: { width: number; height: number }, guide: number) =>
			run(async (dims) => {
				const started = Date.now();
				const photo = await cropToGuide(uri, view, guide);
				const prepareMs = Date.now() - started;
				return { query: { kind: "photo", uri: photo }, vector: await embedImage(photo, dims), prepareMs };
			}),
		[run],
	);

	const onText = useCallback(
		(text: string) =>
			run(async (dims) => ({
				query: { kind: "text", text },
				vector: await embedText(`${index?.manifest.queryPrefix ?? ""}${text}`, dims),
				prepareMs: 0,
			})),
		[run, index],
	);

	const backend = model.state === "ready" ? model.backend : null;
	const setup = !backend || !index || screen === "setup";

	return (
		<SafeAreaProvider>
			<StatusBar style="light" />
			{setup || !index ? (
				<SetupScreen
					model={model}
					setModel={setModel}
					onModelDownloaded={() => setModelOnDisk(true)}
					index={index}
					onIndex={setIndex}
					onClose={backend && index ? () => setScreen("camera") : undefined}
				/>
			) : screen === "results" && result ? (
				<ResultsScreen result={result} manifest={index.manifest} onBack={() => setScreen("camera")} />
			) : (
				<CameraScreen
					index={index}
					backend={backend ?? ""}
					busy={busy}
					onPhoto={onPhoto}
					onText={onText}
					onSettings={() => setScreen("setup")}
				/>
			)}
		</SafeAreaProvider>
	);
}
