import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { splitTitle } from "../format";
import { articleNumber, type Manifest, type Product, pictureUrl } from "../lens-index";
import { colors, fonts } from "../theme";
import { CircleButton, MatchBadge, PillButton, Price } from "../ui";

export interface OpenProduct {
	product: Product;
	/** How close it was to the photo or description, when it came from a search. */
	score?: number;
}

export function ProductSheet(props: {
	open: OpenProduct | null;
	manifest: Manifest;
	saved: boolean;
	onToggleSaved: () => void;
	onClose: () => void;
	onSimilar: (product: Product) => void;
	onCategory: (category: string) => void;
}) {
	return (
		<Modal visible={props.open !== null} animationType="slide" onRequestClose={props.onClose} statusBarTranslucent>
			{/* A modal is its own window on Android, so it needs its own safe-area provider. Pinned to the edges because on
			    the web the modal's container isn't a flex box and `flex: 1` would leave it no height. */}
			<SafeAreaProvider style={StyleSheet.absoluteFill}>{props.open ? <Sheet {...props} open={props.open} /> : null}</SafeAreaProvider>
		</Modal>
	);
}

function Sheet({
	open: { product, score },
	manifest,
	saved,
	onToggleSaved,
	onClose,
	onSimilar,
	onCategory,
}: Parameters<typeof ProductSheet>[0] & { open: OpenProduct }) {
	const insets = useSafeAreaInsets();
	const { width } = useWindowDimensions();
	const { name, description } = splitTitle(product.title);
	const openPage = () => Linking.openURL(product.url);

	return (
		<View style={styles.screen}>
			<ScrollView contentContainerStyle={{ paddingBottom: 140 + insets.bottom }} bounces={false}>
				<View style={[styles.photo, { height: width * 1.05, paddingTop: insets.top }]}>
					<Image source={{ uri: pictureUrl(manifest, product.picture, "m") }} style={styles.fill} contentFit="contain" transition={150} />
				</View>
				<View style={styles.panel}>
					<View style={styles.grabber} />
					<View style={styles.titleRow}>
						<View style={styles.titleText}>
							<Text style={styles.name}>{name || description}</Text>
							{name ? <Text style={styles.description}>{description}</Text> : null}
						</View>
						{score !== undefined ? <MatchBadge score={score} large /> : null}
					</View>
					<View style={styles.priceRow}>
						<Price price={product.price} />
					</View>
					<Text style={styles.article}>{articleNumber(product.id)}</Text>

					<View style={styles.rows}>
						<Row title="Similar products" onPress={() => onSimilar(product)} />
						<Row title={product.category || "Category"} subtitle="More in this category" onPress={() => onCategory(product.category)} />
						<Row title="More info" subtitle="Opens IKEA.com" onPress={openPage} />
					</View>
				</View>
			</ScrollView>

			<CircleButton icon="close" variant="overlay" onPress={onClose} style={{ ...styles.corner, top: insets.top + 10, left: 18 }} />
			<CircleButton
				icon={saved ? "heart" : "heart-outline"}
				variant="black"
				onPress={onToggleSaved}
				style={{ ...styles.corner, top: insets.top + 10, right: 18 }}
			/>

			<View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
				<PillButton title="Open in the IKEA app" onPress={openPage} />
			</View>
		</View>
	);
}

function Row({ title, subtitle, onPress }: { title: string; subtitle?: string; onPress: () => void }) {
	return (
		<Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
			<View style={styles.rowText}>
				<Text style={styles.rowTitle}>{title}</Text>
				{subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
			</View>
			<Ionicons name="chevron-forward" size={28} color={colors.text} />
		</Pressable>
	);
}

const styles = StyleSheet.create({
	screen: { flex: 1, backgroundColor: colors.sheet },
	photo: { backgroundColor: colors.tile, paddingHorizontal: 32, paddingBottom: 36 },
	fill: { flex: 1 },
	panel: {
		backgroundColor: colors.sheet,
		borderTopLeftRadius: 22,
		borderTopRightRadius: 22,
		marginTop: -22,
		paddingHorizontal: 28,
		paddingTop: 12,
	},
	grabber: { alignSelf: "center", width: 48, height: 6, borderRadius: 3, backgroundColor: "#5c5c5c", marginBottom: 22 },
	titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 16 },
	titleText: { flex: 1, gap: 4 },
	name: { color: colors.text, fontFamily: fonts.bold, fontSize: 19, letterSpacing: 0.3 },
	description: { color: colors.text, fontFamily: fonts.regular, fontSize: 18, lineHeight: 26 },
	priceRow: { marginTop: 18 },
	article: { color: colors.muted, fontFamily: fonts.regular, fontSize: 18, marginTop: 14, letterSpacing: 0.5 },
	rows: { marginTop: 28, borderTopWidth: 1, borderTopColor: colors.divider },
	row: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 26,
		borderBottomWidth: 1,
		borderBottomColor: colors.divider,
	},
	rowText: { flex: 1, gap: 2 },
	rowTitle: { color: colors.text, fontFamily: fonts.bold, fontSize: 18 },
	rowSubtitle: { color: colors.muted, fontFamily: fonts.regular, fontSize: 14 },
	corner: { position: "absolute" },
	footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 24, paddingTop: 16, backgroundColor: colors.sheet },
});
