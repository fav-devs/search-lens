import { Image } from "expo-image";
import { useEffect } from "react";
import { BackHandler, FlatList, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { articleNumber, type Hit, type Manifest, type Product, pictureUrl } from "../lens-index";
import { colors } from "../theme";

export interface Result {
	query: { kind: "photo"; uri: string } | { kind: "text"; text: string };
	hits: Hit[];
	timings: { prepareMs: number; modelMs: number; searchMs: number };
}

interface Row {
	key: string;
	product: Product;
	score: number;
	rank: number;
}

export function ResultsScreen({ result, manifest, onBack }: { result: Result; manifest: Manifest; onBack: () => void }) {
	const insets = useSafeAreaInsets();
	// Variants that share a picture (a bed frame in Queen and King) score the same, so they're listed together.
	const rows: Row[] = result.hits.flatMap((hit, rank) =>
		hit.products.map((product) => ({ key: `${hit.picture}-${product.id}`, product, score: hit.score, rank })),
	);
	const { prepareMs, modelMs, searchMs } = result.timings;

	useEffect(() => {
		const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
			onBack();
			return true;
		});
		return () => subscription.remove();
	}, [onBack]);

	return (
		<View style={[styles.screen, { paddingTop: insets.top }]}>
			<View style={styles.header}>
				{result.query.kind === "photo" ? (
					<Image source={{ uri: result.query.uri }} style={styles.photo} />
				) : (
					<View style={[styles.photo, styles.textQuery]}>
						<Text style={styles.textQueryText} numberOfLines={4}>
							“{result.query.text}”
						</Text>
					</View>
				)}
				<View style={styles.headerText}>
					<Text style={styles.title}>Closest products</Text>
					<Text style={styles.muted}>Tap one to open it on IKEA.com</Text>
					<Text style={styles.timing}>
						{prepareMs > 0 ? `crop ${prepareMs} ms · ` : ""}model {modelMs} ms · search {searchMs} ms
					</Text>
				</View>
			</View>

			<FlatList
				data={rows}
				keyExtractor={(row) => row.key}
				contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 96 }}
				renderItem={({ item, index }) => {
					const sharesPicture = index > 0 && rows[index - 1].rank === item.rank;
					return (
						<Pressable
							onPress={() => Linking.openURL(item.product.url)}
							style={({ pressed }) => [styles.row, sharesPicture && styles.variant, pressed && { opacity: 0.7 }]}
						>
							<Image
								source={{ uri: pictureUrl(manifest, item.product.picture) }}
								style={[styles.thumb, sharesPicture && { opacity: 0.35 }]}
								contentFit="contain"
								transition={150}
							/>
							<View style={styles.rowText}>
								<Text style={styles.product} numberOfLines={2}>
									{item.product.title}
								</Text>
								<Text style={styles.meta}>
									${item.product.price.toFixed(2)} · {articleNumber(item.product.id)}
								</Text>
								<Text style={styles.category} numberOfLines={1}>
									{item.product.category}
								</Text>
							</View>
							<Text style={[styles.score, { color: item.score > 0.8 ? colors.good : colors.muted }]}>
								{Math.round(item.score * 100)}
							</Text>
						</Pressable>
					);
				}}
			/>

			<View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
				<Pressable style={styles.button} onPress={onBack}>
					<Text style={styles.buttonText}>Scan another</Text>
				</Pressable>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	screen: { flex: 1, backgroundColor: colors.background },
	header: { flexDirection: "row", gap: 14, padding: 16, alignItems: "center" },
	photo: { width: 96, height: 96, borderRadius: 12, backgroundColor: colors.card },
	textQuery: { padding: 8, justifyContent: "center" },
	textQueryText: { color: colors.text, fontSize: 13 },
	headerText: { flex: 1, gap: 2 },
	title: { color: colors.text, fontSize: 20, fontWeight: "700" },
	muted: { color: colors.muted, fontSize: 13 },
	timing: { color: colors.muted, fontSize: 12, marginTop: 4 },
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		backgroundColor: colors.card,
		borderRadius: 14,
		padding: 10,
		marginTop: 10,
	},
	variant: { marginTop: 2, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
	thumb: { width: 72, height: 72, borderRadius: 8, backgroundColor: "white" },
	rowText: { flex: 1, gap: 2 },
	product: { color: colors.text, fontSize: 15, fontWeight: "600" },
	meta: { color: colors.text, fontSize: 13 },
	category: { color: colors.muted, fontSize: 12 },
	score: { fontSize: 13, fontWeight: "700", width: 28, textAlign: "right" },
	footer: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		paddingHorizontal: 16,
		paddingTop: 12,
		backgroundColor: colors.background,
	},
	button: { backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 15, alignItems: "center" },
	buttonText: { color: colors.text, fontSize: 16, fontWeight: "700" },
});
