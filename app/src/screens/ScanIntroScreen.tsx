import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useMemo } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type Manifest, pictureUrl } from "../lens-index";
import { colors, fonts } from "../theme";
import { CircleButton, PillButton } from "../ui";

/** Shown before the first scan, like IKEA's "Welcome to Shop and scan". */
export function ScanIntroScreen({ manifest, onContinue, onClose }: { manifest: Manifest; onContinue: () => void; onClose: () => void }) {
	const insets = useSafeAreaInsets();
	const { height } = useWindowDimensions();
	const pictures = useMemo(() => Array.from({ length: 9 }, () => Math.floor(Math.random() * manifest.count)), [manifest]);

	return (
		<View style={styles.screen}>
			<View style={[styles.mosaic, { height: height * 0.44 }]}>
				{pictures.map((picture, i) => (
					<View key={i} style={styles.tile}>
						<Image source={{ uri: pictureUrl(manifest, picture) }} style={styles.image} contentFit="contain" />
					</View>
				))}
				<LinearGradient colors={["transparent", colors.background]} style={styles.fade} />
			</View>
			<CircleButton icon="close" variant="overlay" onPress={onClose} style={{ position: "absolute", top: insets.top + 10, left: 20 }} />

			<View style={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
				<Text style={styles.eyebrow}>Welcome to Snap and find</Text>
				<Text style={styles.title}>Take a photo of a product to:</Text>
				<View style={styles.bullets}>
					{["find it without a tag or barcode", "see its price and article number", "show similar products"].map((line) => (
						<Text key={line} style={styles.bullet}>
							•  {line}
						</Text>
					))}
				</View>
				<Text style={styles.note}>Fill the square with the product. Everything runs on this phone.</Text>
				<View style={styles.spacer} />
				<PillButton title="Continue" onPress={onContinue} />
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	screen: { flex: 1, backgroundColor: colors.background },
	mosaic: { flexDirection: "row", flexWrap: "wrap", backgroundColor: colors.tile },
	tile: { width: "33.33%", height: "33.33%", alignItems: "center", justifyContent: "center" },
	image: { width: "78%", height: "78%" },
	fade: { position: "absolute", left: 0, right: 0, bottom: 0, height: "35%" },
	body: { flex: 1, paddingHorizontal: 32, paddingTop: 20 },
	eyebrow: { color: colors.blueText, fontFamily: fonts.bold, fontSize: 18 },
	title: { color: colors.text, fontFamily: fonts.bold, fontSize: 34, lineHeight: 44, marginTop: 18 },
	bullets: { marginTop: 18, gap: 6 },
	bullet: { color: colors.text, fontFamily: fonts.regular, fontSize: 19, lineHeight: 27 },
	note: { color: colors.text, fontFamily: fonts.regular, fontSize: 17, lineHeight: 25, marginTop: 28 },
	spacer: { flex: 1 },
});
