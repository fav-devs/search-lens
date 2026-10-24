import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { useRef, useState } from "react";
import { Pressable, ScrollView, type ScrollViewInstance, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Basket } from "../basket";
import { splitTitle } from "../format";
import { type LensIndex, type Product, pictureUrl } from "../lens-index";
import type { RoomObject, RoomScan } from "../scene/room";
import { OVERLAY_COLORS, objectAt } from "../scene/scene";
import { colors, fonts } from "../theme";
import { CircleButton, MatchBadge, Price } from "../ui";

/** A room photo with the catalogue products found in it: numbered dots on the photo, the matches listed below. */
export function RoomScreen({
	scan,
	index,
	basket,
	onBasket,
	onProduct,
	onBack,
}: {
	scan: RoomScan;
	index: LensIndex;
	basket: Basket;
	onBasket: (product: Product, quantity: number) => void;
	onProduct: (product: Product, score: number) => void;
	onBack: () => void;
}) {
	const insets = useSafeAreaInsets();
	const { width } = useWindowDimensions();
	const height = width / scan.aspect;
	const scroller = useRef<ScrollViewInstance>(null);
	const rows = useRef<Record<number, number>>({});
	const [selected, setSelected] = useState<number | null>(null);

	const open = (object: RoomObject) => {
		setSelected(object.number);
		onProduct(object.hits[0].products[0], object.hits[0].score);
	};

	return (
		<View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
			<View style={styles.top}>
				<CircleButton icon="chevron-back" onPress={onBack} />
				<View style={styles.heading}>
					<Text style={styles.title}>
						{scan.objects.length ? `Found ${scan.objects.length} thing${scan.objects.length === 1 ? "" : "s"}` : "Nothing found"}
					</Text>
					<Text style={styles.muted}>
						{scan.objects.length ? "Tap a dot or a row to open the product" : "Try closer, brighter, or with fewer things in the way"}
						{` · ${(scan.ms / 1000).toFixed(1)} s`}
					</Text>
				</View>
			</View>

			<ScrollView ref={scroller} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
				<Pressable
					onPress={(e) => {
						const hit = objectAt(scan.objects, e.nativeEvent.locationX / width, e.nativeEvent.locationY / height);
						if (hit >= 0) open(scan.objects[hit]);
					}}
				>
					<Image source={{ uri: scan.photoUri }} style={{ width, height }} />
					<Image source={{ uri: scan.overlayUri }} style={[StyleSheet.absoluteFill, { width, height }]} />
					{scan.objects.map((object) => (
						<Pressable
							key={object.number}
							onPress={() => {
								setSelected(object.number);
								scroller.current?.scrollTo({ y: (rows.current[object.number] ?? 0) + height - 80, animated: true });
							}}
							style={[
								styles.dot,
								{ left: object.centre[0] * width - 16, top: object.centre[1] * height - 16 },
								selected === object.number && styles.dotSelected,
							]}
						>
							<Text style={styles.dotText}>{object.number}</Text>
						</Pressable>
					))}
				</Pressable>

				{scan.objects.map((object) => {
					const best = object.hits[0];
					const product = best.products[0];
					const { name, description } = splitTitle(product.title);
					const inBasket = basket[product.id] ?? 0;
					const [r, g, b] = OVERLAY_COLORS[(object.number - 1) % OVERLAY_COLORS.length];
					return (
						<View
							key={object.number}
							onLayout={(e) => (rows.current[object.number] = e.nativeEvent.layout.y)}
							style={[styles.row, selected === object.number && styles.rowSelected]}
						>
							<View style={styles.rowTop}>
								<View style={[styles.number, { backgroundColor: `rgb(${r},${g},${b})` }]}>
									<Text style={styles.numberText}>{object.number}</Text>
								</View>
								<Image source={{ uri: object.cutoutUri }} style={styles.cutout} contentFit="contain" />
								<Ionicons name="arrow-forward" size={18} color={colors.muted} />
								<Pressable onPress={() => open(object)} style={styles.match}>
									<Image source={{ uri: pictureUrl(index.manifest, product.picture) }} style={styles.matchImage} contentFit="contain" />
									<View style={styles.matchText}>
										<MatchBadge score={best.score} />
										<Text style={styles.name} numberOfLines={1}>
											{name || description}
										</Text>
										<Text style={styles.description} numberOfLines={2}>
											{name ? description : ""}
										</Text>
										<Price price={product.price} size={22} />
									</View>
								</Pressable>
								<Pressable
									onPress={() => onBasket(product, inBasket ? 0 : 1)}
									hitSlop={8}
									style={[styles.basketButton, inBasket > 0 && styles.basketButtonOn]}
								>
									<Ionicons name={inBasket ? "checkmark" : "basket-outline"} size={22} color={inBasket ? colors.tileText : colors.text} />
								</Pressable>
							</View>
							{object.hits.length > 1 ? (
								<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.others}>
									<Text style={styles.othersLabel}>Or</Text>
									{object.hits.slice(1).map((hit) => (
										<Pressable key={hit.picture} onPress={() => onProduct(hit.products[0], hit.score)} style={styles.other}>
											<Image source={{ uri: pictureUrl(index.manifest, hit.picture) }} style={styles.otherImage} contentFit="contain" />
											<Text style={styles.otherName} numberOfLines={1}>
												{splitTitle(hit.products[0].title).name || hit.products[0].title}
											</Text>
										</Pressable>
									))}
								</ScrollView>
							) : null}
						</View>
					);
				})}
				{scan.skipped ? (
					<Text style={styles.footnote}>
						{scan.skipped} more thing{scan.skipped === 1 ? "" : "s"} didn’t look like anything in the catalogue.
					</Text>
				) : null}
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	screen: { flex: 1, backgroundColor: colors.background },
	top: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, paddingBottom: 14 },
	heading: { flex: 1, gap: 2 },
	title: { color: colors.text, fontFamily: fonts.bold, fontSize: 24 },
	muted: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13 },
	dot: {
		position: "absolute",
		width: 32,
		height: 32,
		borderRadius: 16,
		backgroundColor: "white",
		borderWidth: 2,
		borderColor: colors.tileText,
		alignItems: "center",
		justifyContent: "center",
	},
	dotSelected: { backgroundColor: colors.yellow, transform: [{ scale: 1.2 }] },
	dotText: { color: colors.tileText, fontFamily: fonts.heavy, fontSize: 15 },
	row: { marginHorizontal: 16, marginTop: 14, padding: 12, borderRadius: 14, backgroundColor: colors.sheet, gap: 10 },
	rowSelected: { borderWidth: 2, borderColor: colors.yellow },
	rowTop: { flexDirection: "row", alignItems: "center", gap: 8 },
	number: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
	numberText: { color: "white", fontFamily: fonts.heavy, fontSize: 14 },
	cutout: { width: 56, height: 56, borderRadius: 6, backgroundColor: colors.tile },
	match: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
	matchImage: { width: 72, height: 72, borderRadius: 6, backgroundColor: colors.tile },
	matchText: { flex: 1, gap: 1 },
	name: { color: colors.text, fontFamily: fonts.bold, fontSize: 14 },
	description: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 16 },
	basketButton: {
		width: 44,
		height: 44,
		borderRadius: 22,
		backgroundColor: colors.field,
		alignItems: "center",
		justifyContent: "center",
	},
	basketButtonOn: { backgroundColor: colors.yellow },
	others: { gap: 8, alignItems: "center", paddingLeft: 36 },
	othersLabel: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, marginRight: 2 },
	other: { width: 76, gap: 4 },
	otherImage: { width: 76, height: 76, borderRadius: 6, backgroundColor: colors.tile },
	otherName: { color: colors.muted, fontFamily: fonts.semibold, fontSize: 11 },
	footnote: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, textAlign: "center", marginTop: 20, paddingHorizontal: 24 },
});
