import { Image } from "expo-image";
import { FlatList, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Hit, Manifest, Product } from "../lens-index";
import { colors, fonts } from "../theme";
import { CircleButton, MatchBadge, ProductCard } from "../ui";

export interface Result {
	query: { kind: "photo"; uri: string } | { kind: "text"; text: string } | { kind: "similar"; product: Product };
	hits: Hit[];
	timings: { prepareMs: number; modelMs: number; searchMs: number };
}

export interface Listed {
	product: Product;
	score?: number;
}

/** Search results flattened to products: variants that share a picture (Queen, King) share its score. */
export function resultProducts(result: Result): Listed[] {
	return result.hits.flatMap((hit) => hit.products.map((product) => ({ product, score: hit.score })));
}

/** IKEA's two-column product list, for search results and for a category. */
export function ProductListScreen({
	title,
	subtitle,
	photo,
	items,
	manifest,
	onBack,
	onProduct,
}: {
	title: string;
	subtitle?: string;
	photo?: string;
	items: Listed[];
	manifest: Manifest;
	onBack: () => void;
	onProduct: (item: Listed) => void;
}) {
	const insets = useSafeAreaInsets();
	const { width } = useWindowDimensions();
	const card = (width - 20 * 2 - 14) / 2;

	return (
		<View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
			<View style={styles.top}>
				<CircleButton icon="chevron-back" onPress={onBack} />
			</View>
			<FlatList
				data={items}
				numColumns={2}
				keyExtractor={(item, i) => `${item.product.id}-${i}`}
				columnWrapperStyle={styles.columns}
				contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 40, gap: 26 }}
				ListHeaderComponent={
					<View style={styles.header}>
						{photo ? <Image source={{ uri: photo }} style={styles.photo} /> : null}
						<View style={styles.headerText}>
							<Text style={styles.title}>{title}</Text>
							{subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
						</View>
					</View>
				}
				renderItem={({ item }) => (
					<ProductCard
						product={item.product}
						manifest={manifest}
						width={card}
						onPress={() => onProduct(item)}
						badge={item.score !== undefined ? <MatchBadge score={item.score} /> : undefined}
					/>
				)}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	screen: { flex: 1, backgroundColor: colors.background },
	top: { paddingHorizontal: 20, paddingBottom: 8 },
	header: { flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 12 },
	photo: { width: 84, height: 84, borderRadius: 4, backgroundColor: colors.sheet },
	headerText: { flex: 1, gap: 4 },
	title: { color: colors.text, fontFamily: fonts.bold, fontSize: 30, lineHeight: 38 },
	subtitle: { color: colors.muted, fontFamily: fonts.regular, fontSize: 14 },
	columns: { gap: 14 },
});
