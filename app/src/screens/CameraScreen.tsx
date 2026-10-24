import { CameraView, useCameraPermissions } from "expo-camera";
import { useRef, useState } from "react";
import { ActivityIndicator, type LayoutRectangle, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts } from "../theme";
import { CircleButton, PillButton } from "../ui";

export type ScanMode = "product" | "room";

export function CameraScreen({
	mode,
	onMode,
	busy,
	step,
	roomReady,
	roomDownload,
	onDownloadRoom,
	onPhoto,
	onRoomPhoto,
	onClose,
}: {
	mode: ScanMode;
	onMode: (mode: ScanMode) => void;
	busy: boolean;
	/** What a room scan is doing right now. */
	step: string | null;
	/** The room scan's models are on the phone. */
	roomReady: boolean;
	/** 0–1 while they download. */
	roomDownload: number | null;
	onDownloadRoom: () => void;
	onPhoto: (uri: string, view: { width: number; height: number }, guide: number) => void;
	onRoomPhoto: (uri: string) => void;
	onClose: () => void;
}) {
	const insets = useSafeAreaInsets();
	const [permission, requestPermission] = useCameraPermissions();
	const camera = useRef<CameraView>(null);
	const [layout, setLayout] = useState<LayoutRectangle | null>(null);
	const [ready, setReady] = useState(false);
	const guide = layout ? Math.min(layout.width - 56, layout.height - 360, 440) : 0;
	const room = mode === "room";

	const shoot = async () => {
		if (!camera.current || !layout || busy) return;
		const photo = await camera.current.takePictureAsync({ quality: 0.8, shutterSound: false });
		if (!photo) return;
		if (room) onRoomPhoto(photo.uri);
		else onPhoto(photo.uri, { width: layout.width, height: layout.height }, guide);
	};

	if (!permission) return <View style={styles.screen} />;
	if (!permission.granted) {
		return (
			<View style={[styles.screen, styles.ask, { paddingTop: insets.top + 80 }]}>
				<Text style={styles.title}>Allow the camera</Text>
				<Text style={styles.body}>Snap and find looks at the product through the camera. Photos stay on this phone.</Text>
				<PillButton title="Allow camera" onPress={requestPermission} />
				<PillButton title="Not now" variant="dark" onPress={onClose} />
			</View>
		);
	}

	const hint = busy
		? (step ?? "Finding it…")
		: room
			? "Fit the room, desk or shelf in the frame"
			: "Fill the square with the product";

	return (
		<View style={styles.screen} onLayout={(e) => setLayout(e.nativeEvent.layout)}>
			<CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" onCameraReady={() => setReady(true)} />

			{layout && !room ? (
				<View
					pointerEvents="none"
					style={[styles.guide, { width: guide, height: guide, left: (layout.width - guide) / 2, top: (layout.height - guide) / 2 }]}
				/>
			) : null}

			<CircleButton icon="close" variant="overlay" onPress={onClose} style={{ position: "absolute", top: insets.top + 10, left: 20 }} />

			<View style={[styles.hint, { top: insets.top + 84 }]}>
				<Text style={styles.hintText}>{hint}</Text>
			</View>

			<View style={[styles.bottom, { paddingBottom: insets.bottom + 24 }]}>
				{room && !roomReady ? (
					<View style={styles.download}>
						<Text style={styles.downloadText}>
							Room scan finds every product in one photo. It needs two more models, downloaded once (193 MB).
						</Text>
						<PillButton
							title={roomDownload === null ? "Download room scan" : `Downloading… ${Math.round(roomDownload * 100)}%`}
							onPress={onDownloadRoom}
							busy={false}
						/>
					</View>
				) : (
					<Pressable
						onPress={shoot}
						disabled={!ready || busy}
						style={({ pressed }) => [styles.shutter, pressed && { transform: [{ scale: 0.94 }] }]}
					>
						{busy ? <ActivityIndicator color={colors.tileText} /> : <View style={styles.shutterInner} />}
					</Pressable>
				)}
				<View style={styles.modes}>
					{(["product", "room"] as const).map((m) => (
						<Pressable key={m} onPress={() => !busy && onMode(m)} style={[styles.mode, mode === m && styles.modeOn]}>
							<Text style={[styles.modeText, mode === m && styles.modeTextOn]}>{m === "product" ? "Product" : "Room"}</Text>
						</Pressable>
					))}
				</View>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	screen: { flex: 1, backgroundColor: "black" },
	ask: { backgroundColor: colors.background, paddingHorizontal: 32, gap: 16 },
	title: { color: colors.text, fontFamily: fonts.bold, fontSize: 34 },
	body: { color: colors.text, fontFamily: fonts.regular, fontSize: 18, lineHeight: 26, marginBottom: 16 },
	guide: { position: "absolute", borderWidth: 3, borderColor: "white", borderRadius: 24 },
	hint: {
		position: "absolute",
		alignSelf: "center",
		backgroundColor: "rgba(0,0,0,0.6)",
		borderRadius: 999,
		paddingHorizontal: 18,
		paddingVertical: 10,
		maxWidth: "86%",
	},
	hintText: { color: colors.text, fontFamily: fonts.semibold, fontSize: 15, textAlign: "center" },
	bottom: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", gap: 22, paddingHorizontal: 24 },
	shutter: { width: 84, height: 84, borderRadius: 42, backgroundColor: "white", alignItems: "center", justifyContent: "center" },
	shutterInner: { width: 70, height: 70, borderRadius: 35, borderWidth: 3, borderColor: colors.tileText },
	download: { alignSelf: "stretch", gap: 12, backgroundColor: "rgba(0,0,0,0.7)", borderRadius: 18, padding: 18 },
	downloadText: { color: colors.text, fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
	modes: { flexDirection: "row", backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 999, padding: 4 },
	mode: { paddingHorizontal: 22, paddingVertical: 9, borderRadius: 999 },
	modeOn: { backgroundColor: "white" },
	modeText: { color: colors.text, fontFamily: fonts.bold, fontSize: 15 },
	modeTextOn: { color: colors.tileText },
});
