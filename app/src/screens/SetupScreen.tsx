import { CameraView, useCameraPermissions } from "expo-camera";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ModelState } from "../App";
import { checkAgainstPC, importIndex, type LensIndex } from "../lens-index";
import { downloadModel, MODEL } from "../model";
import { colors } from "../theme";

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function SetupScreen({
	model,
	setModel,
	onModelDownloaded,
	index,
	onIndex,
	onClose,
}: {
	model: ModelState;
	setModel: (state: ModelState) => void;
	onModelDownloaded: () => void;
	index: LensIndex | null;
	onIndex: (index: LensIndex) => void;
	/** Missing until the model and an index are both ready. */
	onClose?: () => void;
}) {
	const insets = useSafeAreaInsets();
	const [address, setAddress] = useState("");
	const [importing, setImporting] = useState<string | null>(null);
	const [importError, setImportError] = useState<string | null>(null);
	const [scanning, setScanning] = useState(false);
	const [check, setCheck] = useState<string | null>(null);
	const [checking, setChecking] = useState(false);

	useEffect(() => {
		if (!onClose) return;
		const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
			onClose();
			return true;
		});
		return () => subscription.remove();
	}, [onClose]);

	const download = async () => {
		setModel({ state: "downloading", progress: 0 });
		await activateKeepAwakeAsync("model");
		try {
			await downloadModel((progress) => setModel({ state: "downloading", progress }));
			onModelDownloaded();
		} catch (error) {
			setModel({ state: "error", message: message(error) });
		} finally {
			deactivateKeepAwake("model");
		}
	};

	const runImport = async (from: string) => {
		setImportError(null);
		setImporting("Connecting…");
		try {
			onIndex(await importIndex(from, setImporting));
			setCheck(null);
		} catch (error) {
			setImportError(`${message(error)}\nIs \`lens serve\` running, and is the phone on the same Wi-Fi?`);
		} finally {
			setImporting(null);
		}
	};

	const runCheck = async () => {
		if (!index) return;
		setChecking(true);
		setCheck(null);
		try {
			const { similarity, foundFirst, samples, msPerPicture } = await checkAgainstPC(index);
			const verdict = similarity > 0.95 ? "Phone and PC agree." : similarity > 0.85 ? "Close, but not identical." : "They disagree: rebuild the index with the current PC tool.";
			setCheck(
				`${verdict}\nSimilarity ${similarity.toFixed(3)} · ${foundFirst}/${samples} pictures found themselves first · ${Math.round(msPerPicture)} ms per photo`,
			);
		} catch (error) {
			setCheck(`Check failed: ${message(error)}`);
		} finally {
			setChecking(false);
		}
	};

	return (
		<ScrollView
			style={styles.screen}
			contentContainerStyle={{ padding: 20, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32, gap: 16 }}
			keyboardShouldPersistTaps="handled"
		>
			<View style={styles.heading}>
				<Text style={styles.title}>Setup</Text>
				{onClose ? (
					<Pressable onPress={onClose} hitSlop={12}>
						<Text style={styles.link}>Done</Text>
					</Pressable>
				) : null}
			</View>

			<View style={styles.card}>
				<Text style={styles.step}>1 · Model</Text>
				<Text style={styles.muted}>
					EmbeddingGemma 2 (text + vision, {MODEL.megabytes} MB), downloaded once and run on the phone.
				</Text>
				{model.state === "missing" ? (
					<Button title={`Download ${MODEL.megabytes} MB`} onPress={download} />
				) : model.state === "downloading" ? (
					<Progress fraction={model.progress} label={`Downloading… ${Math.round(model.progress * 100)}%`} />
				) : model.state === "loading" ? (
					<Status spinner text="Loading the model…" />
				) : model.state === "ready" ? (
					<Status good text={`Ready on the ${model.backend}`} />
				) : (
					<>
						<Status text={model.message} />
						<Button title="Try the download again" onPress={download} />
					</>
				)}
			</View>

			<View style={styles.card}>
				<Text style={styles.step}>2 · Products from the PC</Text>
				{index ? (
					<Status
						good
						text={`${index.manifest.products.length.toLocaleString()} products · ${index.manifest.count.toLocaleString()} pictures · built ${new Date(index.manifest.created).toLocaleDateString()}`}
					/>
				) : (
					<Text style={styles.muted}>On the PC, run `lens` (or `lens serve`), then scan the code it shows.</Text>
				)}
				{importing ? (
					<Status spinner text={importing} />
				) : (
					<>
						<Button title="Scan the PC's code" onPress={() => setScanning(true)} />
						<View style={styles.addressRow}>
							<TextInput
								style={styles.input}
								value={address}
								onChangeText={setAddress}
								placeholder="or type 192.168.1.20:8765"
								placeholderTextColor={colors.muted}
								autoCapitalize="none"
								autoCorrect={false}
								keyboardType="url"
								onSubmitEditing={() => address.trim() && runImport(address)}
							/>
							<Button title="Get" onPress={() => address.trim() && runImport(address)} small />
						</View>
					</>
				)}
				{importError ? <Text style={styles.error}>{importError}</Text> : null}
			</View>

			{index && model.state === "ready" ? (
				<View style={styles.card}>
					<Text style={styles.step}>3 · Check</Text>
					<Text style={styles.muted}>
						Embeds a few catalogue pictures here and compares them with the PC’s vectors. Needs internet for the
						pictures.
					</Text>
					{checking ? <Status spinner text="Checking…" /> : <Button title="Check against the PC" onPress={runCheck} />}
					{check ? <Text style={styles.body}>{check}</Text> : null}
				</View>
			) : null}

			{onClose ? <Button title="Start scanning products" onPress={onClose} /> : null}

			<QrScanner
				visible={scanning}
				onClose={() => setScanning(false)}
				onScan={(data) => {
					setScanning(false);
					setAddress(data);
					runImport(data);
				}}
			/>
		</ScrollView>
	);
}

function QrScanner({ visible, onClose, onScan }: { visible: boolean; onClose: () => void; onScan: (data: string) => void }) {
	const [permission, requestPermission] = useCameraPermissions();
	// The camera reports the same code many times a second; only the first one counts.
	const handled = useRef(false);
	useEffect(() => {
		if (visible) handled.current = false;
	}, [visible]);

	return (
		<Modal visible={visible} animationType="slide" onRequestClose={onClose}>
			<View style={styles.scanner}>
				{permission?.granted ? (
					<CameraView
						style={StyleSheet.absoluteFill}
						barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
						onBarcodeScanned={({ data }) => {
							if (handled.current || !/^https?:\/\//i.test(data)) return;
							handled.current = true;
							onScan(data);
						}}
					/>
				) : (
					<Button title="Allow camera" onPress={requestPermission} />
				)}
				<View style={styles.scannerBar}>
					<Text style={styles.body}>Point at the code in the PC’s terminal</Text>
					<Button title="Cancel" onPress={onClose} small />
				</View>
			</View>
		</Modal>
	);
}

function Button({ title, onPress, small }: { title: string; onPress: () => void; small?: boolean }) {
	return (
		<Pressable onPress={onPress} style={({ pressed }) => [styles.button, small && styles.small, pressed && { opacity: 0.7 }]}>
			<Text style={styles.buttonText}>{title}</Text>
		</Pressable>
	);
}

function Status({ text, spinner, good }: { text: string; spinner?: boolean; good?: boolean }) {
	return (
		<View style={styles.status}>
			{spinner ? <ActivityIndicator color={colors.muted} /> : <View style={[styles.dot, { backgroundColor: good ? colors.good : colors.warn }]} />}
			<Text style={styles.body}>{text}</Text>
		</View>
	);
}

function Progress({ fraction, label }: { fraction: number; label: string }) {
	return (
		<View style={{ gap: 8 }}>
			<View style={styles.track}>
				<View style={[styles.bar, { width: `${Math.round(fraction * 100)}%` }]} />
			</View>
			<Text style={styles.muted}>{label}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	screen: { flex: 1, backgroundColor: colors.background },
	heading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
	title: { color: colors.text, fontSize: 28, fontWeight: "800" },
	link: { color: colors.accent, fontSize: 16, fontWeight: "700" },
	card: { backgroundColor: colors.card, borderRadius: 16, padding: 16, gap: 12 },
	step: { color: colors.text, fontSize: 17, fontWeight: "700" },
	muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
	body: { color: colors.text, fontSize: 14, lineHeight: 20, flexShrink: 1 },
	error: { color: colors.warn, fontSize: 13, lineHeight: 19 },
	status: { flexDirection: "row", alignItems: "center", gap: 10 },
	dot: { width: 10, height: 10, borderRadius: 5 },
	button: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 13, alignItems: "center" },
	small: { paddingHorizontal: 18, paddingVertical: 11 },
	buttonText: { color: colors.text, fontSize: 15, fontWeight: "700" },
	addressRow: { flexDirection: "row", gap: 10, alignItems: "center" },
	input: {
		flex: 1,
		backgroundColor: colors.background,
		color: colors.text,
		borderRadius: 12,
		paddingHorizontal: 14,
		paddingVertical: 11,
		fontSize: 15,
	},
	track: { height: 8, borderRadius: 4, backgroundColor: colors.background, overflow: "hidden" },
	bar: { height: 8, backgroundColor: colors.accent },
	scanner: { flex: 1, backgroundColor: "black", justifyContent: "flex-end" },
	scannerBar: { padding: 20, paddingBottom: 48, gap: 12, backgroundColor: "rgba(0,0,0,0.6)" },
});
