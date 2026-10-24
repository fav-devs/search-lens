import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { useMemo } from "react";
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Basket } from "../basket";
import { splitTitle } from "../format";
import { articleNumber, type LensIndex, type Product, pictureUrl } from "../lens-index";
import { colors, fonts } from "../theme";
import { PillButton, Price, Stepper, TAB_BAR_SPACE } from "../ui";

/** What's been added from scans and product pages. It stays on the phone; Share sends the list as text. */
export function BasketScreen({
	basket,
	index,
	onQuantity,
	onProduct,
	onScan,
}: {
	basket: Basket;
	index: LensIndex;
	onQuantity: (product: Product, quantity: number) => void;
	onProduct: (product: Product) => void;
	onScan: () => void;
}) {
	const insets = useSafeAreaInsets();
	const items = useMemo(() => {
		const byId = new Map(index.manifest.products.map((p) => [p.id, p]));
		return Object.entries(basket)
			.map(([id, quantity]) => ({ product: byId.get(id), quantity }))
			.filter((item): item is { product: Product; quantity: number } => !!item.product);
	}, [basket, index]);
	const total = items.reduce((sum, { product, quantity }) => sum + product.price * quantity, 0);
	const count = items.reduce((sum, { quantity }) => sum + quantity, 0);

	const share = () => {
		const lines = items.map(({ product, quantity }) => `${quantity} × ${product.title} — ${articleNumber(product.id)} — $${(product.price * quantity).toFixed(2)}`);
		Share.share({ message: [...lines, "", `Total: $${total.toFixed(2)} (US prices)`].join("\n") });
	};

	return (
		<ScrollView
			style={styles.screen}
			contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: TAB_BAR_SPACE + insets.bottom, paddingHorizontal: 20 }}
		>
			<Text style={styles.title}>Basket</Text>
			{items.length === 0 ? (
				<View style={styles.empty}>
					<Ionicons name="basket-outline" size={56} color={colors.muted} />
					<Text style={styles.emptyTitle}>Your basket is empty</Text>
					<Text style={styles.muted}>Scan a room or a product and add what you find.</Text>
					<PillButton title="Scan" onPress={onScan} style={{ alignSelf: "stretch", marginTop: 12 }} />
				</View>
			) : (
				<>
					<Text style={styles.muted}>
						{count} item{count === 1 ? "" : "s"}
					</Text>
					{items.map(({ product, quantity }) => {
						const { name, description } = splitTitle(product.title);
						return (
							<View key={product.id} style={styles.row}>
								<Pressable onPress={() => onProduct(product)}>
									<Image source={{ uri: pictureUrl(index.manifest, product.picture) }} style={styles.picture} contentFit="contain" />
								</Pressable>
								<View style={styles.rowText}>
									<Text style={styles.name}>{name || description}</Text>
									<Text style={styles.description} numberOfLines={2}>
										{name ? description : ""}
									</Text>
									<Text style={styles.article}>{articleNumber(product.id)}</Text>
									<View style={styles.rowBottom}>
										<Stepper value={quantity} onChange={(n) => onQuantity(product, n)} compact />
										<Price price={product.price * quantity} size={22} />
									</View>
								</View>
							</View>
						);
					})}
					<View style={styles.total}>
						<Text style={styles.totalLabel}>Total</Text>
						<Price price={total} size={36} />
					</View>
					<Text style={styles.muted}>US prices from the July 2025 catalogue, before tax.</Text>
					<PillButton title="Share list" onPress={share} style={{ marginTop: 18 }} />
				</>
			)}
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	screen: { flex: 1, backgroundColor: colors.background },
	title: { color: colors.text, fontFamily: fonts.bold, fontSize: 34, marginBottom: 4 },
	muted: { color: colors.muted, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
	empty: { alignItems: "center", gap: 8, marginTop: 80, paddingHorizontal: 12 },
	emptyTitle: { color: colors.text, fontFamily: fonts.bold, fontSize: 20 },
	row: { flexDirection: "row", gap: 14, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: colors.divider },
	picture: { width: 96, height: 96, borderRadius: 4, backgroundColor: colors.tile },
	rowText: { flex: 1, gap: 2 },
	name: { color: colors.text, fontFamily: fonts.bold, fontSize: 15 },
	description: { color: colors.text, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
	article: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, marginTop: 2 },
	rowBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 },
	total: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 22, marginBottom: 6 },
	totalLabel: { color: colors.text, fontFamily: fonts.bold, fontSize: 20 },
});
