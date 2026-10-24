import {
	NotoSans_400Regular,
	NotoSans_500Medium,
	NotoSans_600SemiBold,
	NotoSans_700Bold,
	NotoSans_800ExtraBold,
	useFonts,
} from "@expo-google-fonts/noto-sans";
import { File, Paths } from "expo-file-system";
import { StatusBar } from "expo-status-bar";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Alert, BackHandler, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { type Basket, basketCount, readBasket, withQuantity, writeBasket } from "./basket";
import { bundledIndexWanted, installBundledIndex } from "./bundled";
import { splitTitle } from "./format";
import { type LensIndex, loadIndex, type Product, pictureVector, search } from "./lens-index";
import { embedImage, embedText, loadModel, modelPresent } from "./model";
import { cropToGuide } from "./photo";
import { downloadSceneModels, sceneModelsPresent } from "./scene/models";
import { type RoomScan, scanRoom } from "./scene/room";
import { readSettings, type Settings, writeSettings } from "./settings";
import { BasketScreen } from "./screens/BasketScreen";
import { CameraScreen, type ScanMode } from "./screens/CameraScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { type OpenProduct, ProductSheet } from "./screens/ProductSheet";
import { ProductListScreen, type Result, resultProducts } from "./screens/ResultsScreen";
import { RoomScreen } from "./screens/RoomScreen";
import { ScanIntroScreen } from "./screens/ScanIntroScreen";
import { SearchScreen } from "./screens/SearchScreen";
import { SetupScreen } from "./screens/SetupScreen";
import { colors } from "./theme";
import { type Tab, TabBar } from "./ui";

export type ModelState =
	| { state: "missing" }
	| { state: "downloading"; progress: number }
	| { state: "loading" }
	| { state: "ready"; backend: string }
	| { state: "error"; message: string };

/** Screens pushed over the tabs; the tab bar shows only when none is. */
type Route =
	| { name: "intro" }
	| { name: "camera" }
	| { name: "results"; result: Result }
	| { name: "room"; scan: RoomScan }
	| { name: "category"; category: string };

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const introFile = () => new File(Paths.document, "scan-intro-seen");

export default function App() {
	const [fontsLoaded] = useFonts({ NotoSans_400Regular, NotoSans_500Medium, NotoSans_600SemiBold, NotoSans_700Bold, NotoSans_800ExtraBold });
	const [modelOnDisk, setModelOnDisk] = useState(modelPresent);
	const [model, setModel] = useState<ModelState>({ state: modelOnDisk ? "loading" : "missing" });
	const [index, setIndex] = useState<LensIndex | null>(null);
	const [indexRead, setIndexRead] = useState(false);
	const [unpacking, setUnpacking] = useState<number | null>(null);
	const [tab, setTab] = useState<Tab>("home");
	const [stack, setStack] = useState<Route[]>([]);
	const [open, setOpen] = useState<OpenProduct | null>(null);
	const [recent, setRecent] = useState<Product[]>([]);
	const [recentSearches, setRecentSearches] = useState<string[]>([]);
	const [saved, setSaved] = useState<Product[]>([]);
	const [busy, setBusy] = useState(false);
	const [settings, setSettings] = useState<Settings>(readSettings);
	const [basket, setBasket] = useState<Basket>(readBasket);
	const [scanMode, setScanMode] = useState<ScanMode>("product");
	const [roomStep, setRoomStep] = useState<string | null>(null);
	const [roomReady, setRoomReady] = useState(sceneModelsPresent);
	const [roomDownload, setRoomDownload] = useState<number | null>(null);
	const changeSettings = useCallback((next: Settings) => {
		setSettings(next);
		writeSettings(next);
	}, []);

	useEffect(() => {
		(async () => {
			let installed: LensIndex | null = null;
			try {
				installed = await loadIndex();
				setIndex(installed);
			} catch (error) {
				Alert.alert("Couldn't read the saved index", message(error));
			}
			// A build with the catalogue inside installs it the first time it opens, and again after an update brings
			// a newer one, unless the index on the phone was imported from the PC.
			if (bundledIndexWanted(installed)) {
				try {
					setUnpacking(0);
					const bundled = await installBundledIndex(installed, setUnpacking);
					if (bundled) setIndex(bundled);
				} catch (error) {
					Alert.alert("Couldn't unpack the catalogue", message(error));
				} finally {
					setUnpacking(null);
				}
			}
			setIndexRead(true);
		})();
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

	const push = useCallback((route: Route) => setStack((routes) => [...routes, route]), []);
	const pop = useCallback(() => setStack((routes) => routes.slice(0, -1)), []);

	// Android's back button: close the top screen, then go back to Home, then leave the app.
	useEffect(() => {
		const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
			if (stack.length) {
				pop();
				return true;
			}
			if (tab !== "home") {
				setTab("home");
				return true;
			}
			return false;
		});
		return () => subscription.remove();
	}, [stack.length, tab, pop]);

	const startScan = useCallback(() => push(introFile().exists ? { name: "camera" } : { name: "intro" }), [push]);

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
				const result: Result = { query, hits, timings: { prepareMs, modelMs, searchMs: Date.now() - searchStarted } };
				const best = hits[0]?.products[0];
				if (best && query.kind === "photo") setRecent((products) => [best, ...products.filter((p) => p.id !== best.id)].slice(0, 10));
				// A photo's results replace the camera, so Back from them goes where the scan started.
				setStack((routes) => [...routes.filter((route) => route.name !== "camera"), { name: "results", result }]);
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

	const onSearch = useCallback(
		(text: string) => {
			setRecentSearches((searches) => [text, ...searches.filter((s) => s !== text)].slice(0, 12));
			return run(async (dims) => ({
				query: { kind: "text", text },
				vector: await embedText(`${index?.manifest.queryPrefix ?? ""}${text}`, dims),
				prepareMs: 0,
			}));
		},
		[run, index],
	);

	const onSimilar = useCallback(
		(product: Product) => {
			if (!index) return;
			setOpen(null);
			const started = Date.now();
			const hits = search(index, pictureVector(index, product.picture), 13).filter((hit) => hit.picture !== product.picture);
			push({ name: "results", result: { query: { kind: "similar", product }, hits, timings: { prepareMs: 0, modelMs: 0, searchMs: Date.now() - started } } });
		},
		[index, push],
	);

	const onCategory = useCallback(
		(category: string) => {
			setOpen(null);
			push({ name: "category", category });
		},
		[push],
	);

	const setQuantity = useCallback((product: Product, quantity: number) => {
		setBasket((current) => {
			const next = withQuantity(current, product.id, quantity);
			writeBasket(next);
			return next;
		});
	}, []);

	const downloadRoom = useCallback(async () => {
		if (roomDownload !== null) return;
		setRoomDownload(0);
		try {
			await downloadSceneModels(setRoomDownload);
			setRoomReady(true);
		} catch (error) {
			Alert.alert("Couldn't download the room scan", message(error));
		} finally {
			setRoomDownload(null);
		}
	}, [roomDownload]);

	const onRoomPhoto = useCallback(
		async (uri: string) => {
			if (!index) return;
			setBusy(true);
			setRoomStep("Reading the photo…");
			try {
				const scan = await scanRoom(uri, index, setRoomStep);
				const found = scan.objects.map((o) => o.hits[0].products[0]);
				setRecent((products) => [...found, ...products.filter((p) => !found.some((f) => f.id === p.id))].slice(0, 10));
				setStack((routes) => [...routes.filter((route) => route.name !== "camera"), { name: "room", scan }]);
			} catch (error) {
				Alert.alert("Room scan failed", message(error));
			} finally {
				setBusy(false);
				setRoomStep(null);
			}
		},
		[index],
	);

	const toggleSaved = useCallback(() => {
		if (!open) return;
		setSaved((products) =>
			products.some((p) => p.id === open.product.id) ? products.filter((p) => p.id !== open.product.id) : [open.product, ...products],
		);
	}, [open]);

	const top = stack.at(-1);
	const categoryItems = useMemo(
		() =>
			top?.name === "category" && index
				? index.manifest.products.filter((product) => product.category === top.category).map((product) => ({ product }))
				: [],
		[top, index],
	);

	const backend = model.state === "ready" ? model.backend : null;

	if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: colors.background }} />;

	let screen: ReactNode;
	if (!backend || !index) {
		screen = (
			<SetupScreen
				model={model}
				setModel={setModel}
				onModelDownloaded={() => setModelOnDisk(true)}
				index={index}
				onIndex={setIndex}
				unpacking={unpacking}
			/>
		);
	} else if (top?.name === "intro") {
		screen = (
			<ScanIntroScreen
				manifest={index.manifest}
				onClose={pop}
				onContinue={() => {
					introFile().create({ overwrite: true });
					setStack((routes) => [...routes.slice(0, -1), { name: "camera" }]);
				}}
			/>
		);
	} else if (top?.name === "camera") {
		screen = (
			<CameraScreen
				mode={scanMode}
				onMode={setScanMode}
				busy={busy}
				step={roomStep}
				roomReady={roomReady}
				roomDownload={roomDownload}
				onDownloadRoom={downloadRoom}
				onPhoto={onPhoto}
				onRoomPhoto={onRoomPhoto}
				onClose={pop}
			/>
		);
	} else if (top?.name === "room") {
		screen = (
			<RoomScreen
				scan={top.scan}
				index={index}
				basket={basket}
				onBasket={setQuantity}
				onProduct={(product, score) => setOpen({ product, score })}
				onBack={pop}
			/>
		);
	} else if (top?.name === "results") {
		const { query, timings } = top.result;
		const title =
			query.kind === "photo" ? "Best matches" : query.kind === "text" ? `“${query.text}”` : `Similar to ${splitTitle(query.product.title).name || "this"}`;
		const subtitle =
			query.kind === "similar"
				? `${timings.searchMs} ms`
				: `${timings.prepareMs ? `crop ${timings.prepareMs} ms · ` : ""}model ${timings.modelMs} ms · search ${timings.searchMs} ms`;
		screen = (
			<ProductListScreen
				title={title}
				subtitle={subtitle}
				photo={query.kind === "photo" ? query.uri : undefined}
				items={resultProducts(top.result)}
				manifest={index.manifest}
				onBack={pop}
				onProduct={setOpen}
			/>
		);
	} else if (top?.name === "category") {
		screen = (
			<ProductListScreen
				title={top.category}
				subtitle={`${categoryItems.length.toLocaleString()} products`}
				items={categoryItems}
				manifest={index.manifest}
				onBack={pop}
				onProduct={setOpen}
			/>
		);
	} else {
		screen = (
			<>
				{tab === "home" ? (
					<HomeScreen
						index={index}
						recent={recent}
						saved={saved}
						onScan={startScan}
						onSettings={() => setTab("you")}
						onProduct={(product) => setOpen({ product })}
					/>
				) : tab === "search" ? (
					<SearchScreen
						index={index}
						busy={busy}
						recentSearches={recentSearches}
						onSearch={onSearch}
						onScan={startScan}
						onCategory={onCategory}
					/>
				) : tab === "basket" ? (
					<BasketScreen basket={basket} index={index} onQuantity={setQuantity} onProduct={(product) => setOpen({ product })} onScan={startScan} />
				) : (
					<SetupScreen
						model={model}
						setModel={setModel}
						onModelDownloaded={() => setModelOnDisk(true)}
						index={index}
						onIndex={setIndex}
						onClose={() => setTab("home")}
						settings={settings}
						onSettings={changeSettings}
						inTabs
					/>
				)}
				<TabBar tab={tab} onTab={setTab} onScan={startScan} basketCount={basketCount(basket)} />
			</>
		);
	}

	return (
		<SafeAreaProvider>
			<StatusBar style="light" />
			<View style={{ flex: 1, backgroundColor: colors.background }}>{screen}</View>
			{index ? (
				<ProductSheet
					open={open}
					index={index}
					country={settings.country}
					saved={open ? saved.some((p) => p.id === open.product.id) : false}
					onToggleSaved={toggleSaved}
					inBasket={open ? (basket[open.product.id] ?? 0) : 0}
					onBasket={setQuantity}
					onClose={() => setOpen(null)}
					onSimilar={onSimilar}
					onCategory={onCategory}
				/>
			) : null}
		</SafeAreaProvider>
	);
}
