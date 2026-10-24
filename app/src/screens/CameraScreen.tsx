import { CameraView, useCameraPermissions } from "expo-camera";
import { useRef, useState } from "react";
import {
	ActivityIndicator,
	KeyboardAvoidingView,
	type LayoutRectangle,
	Platform,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { LensIndex } from "../lens-index";
import { colors } from "../theme";

export function CameraScreen({
	index,
	backend,
	busy,
	onPhoto,
	onText,
	onSettings,
}: {
	index: LensIndex;
	backend: string;
	busy: boolean;
	onPhoto: (uri: string, view: { width: number; height: number }, guide: number) => void;
	onText: (text: string) => void;
	onSettings: () => void;
}) {
	const insets = useSafeAreaInsets();
	const [permission, requestPermission] = useCameraPermissions();
	const camera = useRef<CameraView>(null);
	const [layout, setLayout] = useState<LayoutRectangle | null>(null);
	const [ready, setReady] = useState(false);
	const [text, setText] = useState("");
	const guide = layout ? Math.min(layout.width - 48, layout.height - 320, 420) : 0;

	const shoot = async () => {
		if (!camera.current || !layout || busy) return;
		const photo = await camera.current.takePictureAsync({ quality: 0.8, shutterSound: false });
		if (photo) onPhoto(photo.uri, { width: layout.width, height: layout.height }, guide);
	};

	if (!permission) return <View style={styles.screen} />;
	if (!permission.granted) {
		return (
			<View style={[styles.screen, styles.centre]}>
				<Text style={styles.title}>Camera</Text>
				<Text style={styles.muted}>Product Lens needs the camera to see the product.</Text>
				<Pressable style={styles.button} onPress={requestPermission}>
					<Text style={styles.buttonText}>Allow camera</Text>
				</Pressable>
			</View>
		);
	}

	return (
		<KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
			<View style={StyleSheet.absoluteFill} onLayout={(e) => setLayout(e.nativeEvent.layout)}>
				<CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" onCameraReady={() => setReady(true)} />
			</View>

			{layout ? (
				<View pointerEvents="none" style={[styles.guide, { width: guide, height: guide, left: (layout.width - guide) / 2, top: (layout.height - guide) / 2 }]} />
			) : null}

			<View style={[styles.top, { paddingTop: insets.top + 8 }]}>
				<View>
					<Text style={styles.title}>Product Lens</Text>
					<Text style={styles.muted}>
						{index.manifest.products.length.toLocaleString()} products · {backend}
					</Text>
				</View>
				<Pressable onPress={onSettings} hitSlop={12} style={styles.chip}>
					<Text style={styles.chipText}>Setup</Text>
				</Pressable>
			</View>

			<View style={styles.fill} pointerEvents="none" />
			<View style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]}>
				<Text style={styles.hint}>Fill the square with the product</Text>
				<Pressable
					onPress={shoot}
					disabled={!ready || busy}
					style={({ pressed }) => [styles.shutter, (pressed || busy) && { opacity: 0.6 }]}
				>
					{busy ? <ActivityIndicator color={colors.background} /> : <View style={styles.shutterInner} />}
				</Pressable>
				<TextInput
					style={styles.input}
					value={text}
					onChangeText={setText}
					placeholder="…or describe it: “white 4-drawer dresser”"
					placeholderTextColor={colors.muted}
					returnKeyType="search"
					editable={!busy}
					onSubmitEditing={() => text.trim() && onText(text.trim())}
				/>
			</View>
		</KeyboardAvoidingView>
	);
}

const styles = StyleSheet.create({
	screen: { flex: 1, backgroundColor: "black" },
	centre: { alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
	top: {
		position: "absolute",
		left: 0,
		right: 0,
		top: 0,
		paddingHorizontal: 20,
		paddingBottom: 12,
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		backgroundColor: "rgba(0,0,0,0.45)",
	},
	title: { color: colors.text, fontSize: 20, fontWeight: "700" },
	muted: { color: colors.muted, fontSize: 13 },
	chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.15)" },
	chipText: { color: colors.text, fontWeight: "600" },
	guide: { position: "absolute", borderWidth: 2, borderColor: "rgba(255,255,255,0.9)", borderRadius: 20 },
	fill: { flex: 1 },
	bottom: {
		paddingHorizontal: 20,
		paddingTop: 12,
		alignItems: "center",
		gap: 14,
		backgroundColor: "rgba(0,0,0,0.45)",
	},
	hint: { color: colors.text, fontSize: 14 },
	shutter: {
		width: 76,
		height: 76,
		borderRadius: 38,
		backgroundColor: colors.text,
		alignItems: "center",
		justifyContent: "center",
	},
	shutterInner: { width: 64, height: 64, borderRadius: 32, borderWidth: 3, borderColor: colors.background },
	input: {
		alignSelf: "stretch",
		backgroundColor: "rgba(255,255,255,0.12)",
		color: colors.text,
		borderRadius: 12,
		paddingHorizontal: 14,
		paddingVertical: 12,
		fontSize: 15,
	},
	button: { backgroundColor: colors.accent, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12 },
	buttonText: { color: colors.text, fontWeight: "700" },
});
