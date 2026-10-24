import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type LensIndex, type Product, pictureUrl } from "../lens-index";
import { colors, fonts } from "../theme";
import { CircleButton, ProductCard, TAB_BAR_SPACE } from "../ui";

export function HomeScreen({
	index,
	recent,
	saved,
	onScan,
	onSettings,
	onProduct,
}: {
	index: LensIndex;
	recent: Product[];
	saved: Product[];
	onScan: () => void;
	onSettings: () => void;
	onProduct: (product: Product) => void;
}) {
	const insets = useSafeAreaInsets();
	const { width } = useWindowDimensions();
	const { manifest } = index;
	// A few products picked once per visit: four for the hero, more to browse when nothing has been found yet.
	const picks = useMemo(() => {
		const products = manifest.products;
		return Array.from({ length: 10 }, () => products[Math.floor(Math.random() * products.length)]);
	}, [manifest]);
	const card = (width - 16 * 2 - 12) / 2;
	const tile = (width - 2) / 2;

	const shelf = (title: string, products: Product[]) =>
		products.length ? (
			<View style={styles.section}>
				<Text style={styles.sectionTitle}>{title}</Text>
				<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelf}>
					{products.map((product, i) => (
						<ProductCard key={`${product.id}-${i}`} product={product} manifest={manifest} width={card} onPress={() => onProduct(product)} />
					))}
				</ScrollView>
			</View>
		) : null;

	return (
		<ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: TAB_BAR_SPACE + insets.bottom }}>
			<View style={[styles.header, { paddingTop: insets.top + 12 }]}>
				<View style={styles.actions}>
					<CircleButton icon="settings-outline" onPress={onSettings} />
				</View>
				<View style={styles.hejRow}>
					<Text style={styles.hej}>Hej!</Text>
					<View style={styles.star}>
						<Text style={styles.starText}>*</Text>
					</View>
				</View>
			</View>

			<Pressable onPress={onScan} style={[styles.hero, { height: width * 1.22 }]}>
				<View style={styles.mosaic}>
					{picks.slice(0, 4).map((product, i) => (
						<View key={i} style={[styles.mosaicTile, { width: tile, height: (width * 1.22 - 2) / 2 }]}>
							<Image source={{ uri: pictureUrl(manifest, product.picture, "s") }} style={styles.mosaicImage} contentFit="contain" />
						</View>
					))}
				</View>
				<LinearGradient colors={["transparent", "rgba(0,0,0,0.85)"]} style={styles.heroShade} />
				<View style={styles.heroText}>
					<Text style={styles.tag}>Snap & find</Text>
					<Text style={styles.heroTitle}>No tag? No barcode? Take a photo and find it.</Text>
				</View>
			</Pressable>

			{shelf("Recently found", recent)}
			{shelf("Saved", saved)}
			{recent.length === 0 ? shelf("Try one of these", picks.slice(4)) : null}

			<Text style={styles.footnote}>
				{manifest.products.length.toLocaleString()} products · catalogue from {new Date(manifest.created).toLocaleDateString()}
			</Text>
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	screen: { flex: 1, backgroundColor: colors.background },
	header: { paddingHorizontal: 24, paddingBottom: 28 },
	actions: { flexDirection: "row", justifyContent: "flex-end" },
	hejRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8 },
	hej: { color: colors.text, fontFamily: fonts.heavy, fontSize: 84, lineHeight: 96, letterSpacing: -2 },
	star: {
		width: 46,
		height: 46,
		borderRadius: 23,
		backgroundColor: colors.yellow,
		alignItems: "center",
		justifyContent: "center",
		marginTop: 6,
	},
	starText: { color: colors.tileText, fontFamily: fonts.heavy, fontSize: 34, lineHeight: 44, marginTop: 8 },
	hero: { backgroundColor: colors.tile },
	mosaic: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 2, backgroundColor: "#ececec" },
	mosaicTile: { backgroundColor: colors.tile, alignItems: "center", justifyContent: "center" },
	mosaicImage: { width: "82%", height: "82%" },
	heroShade: { position: "absolute", left: 0, right: 0, bottom: 0, height: "55%" },
	heroText: { position: "absolute", left: 24, right: 24, bottom: 32, gap: 14 },
	tag: {
		alignSelf: "flex-start",
		backgroundColor: colors.tag,
		color: colors.tileText,
		fontFamily: fonts.bold,
		fontSize: 17,
		paddingHorizontal: 12,
		paddingVertical: 5,
	},
	heroTitle: { color: colors.text, fontFamily: fonts.bold, fontSize: 26, lineHeight: 34 },
	section: { marginTop: 32, gap: 14 },
	sectionTitle: { color: colors.text, fontFamily: fonts.bold, fontSize: 22, paddingHorizontal: 16 },
	shelf: { paddingHorizontal: 16, gap: 12 },
	footnote: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, textAlign: "center", marginTop: 36 },
});
