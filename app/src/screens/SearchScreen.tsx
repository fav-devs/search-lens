import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type LensIndex, pictureUrl, topCategories } from "../lens-index";
import { colors, fonts } from "../theme";
import { CircleButton, TAB_BAR_SPACE } from "../ui";

export function SearchScreen({
	index,
	busy,
	recentSearches,
	onSearch,
	onScan,
	onCategory,
}: {
	index: LensIndex;
	busy: boolean;
	recentSearches: string[];
	onSearch: (text: string) => void;
	onScan: () => void;
	onCategory: (category: string) => void;
}) {
	const insets = useSafeAreaInsets();
	const { width } = useWindowDimensions();
	const [text, setText] = useState("");
	const [tab, setTab] = useState<"products" | "recent">("products");
	const categories = useMemo(() => topCategories(index, 24), [index]);
	const card = (width - 24 * 2 - 12) / 2;
	const submit = (query = text) => query.trim() && !busy && onSearch(query.trim());

	return (
		<View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
			<View style={styles.searchRow}>
				<View style={styles.field}>
					{busy ? <ActivityIndicator color={colors.muted} /> : <Ionicons name="search" size={26} color={colors.muted} />}
					<TextInput
						style={styles.input}
						value={text}
						onChangeText={setText}
						placeholder="What are you looking for?"
						placeholderTextColor={colors.muted}
						returnKeyType="search"
						onSubmitEditing={() => submit()}
					/>
				</View>
				<CircleButton icon="scan-outline" variant="light" size={58} onPress={onScan} />
			</View>

			<View style={styles.tabs}>
				{(["products", "recent"] as const).map((key) => (
					<Pressable key={key} onPress={() => setTab(key)} style={[styles.tab, tab === key && styles.tabActive]}>
						<Text style={[styles.tabText, tab === key && styles.tabTextActive]}>{key === "products" ? "Products" : "Recent"}</Text>
					</Pressable>
				))}
			</View>

			<ScrollView contentContainerStyle={[styles.content, { paddingBottom: TAB_BAR_SPACE + insets.bottom }]} keyboardShouldPersistTaps="handled">
				{tab === "products" ? (
					<>
						<Pressable onPress={onScan} style={({ pressed }) => [styles.wide, pressed && { opacity: 0.85 }]}>
							<View style={styles.wideIcon}>
								<Ionicons name="camera-outline" size={30} color={colors.tileText} />
							</View>
							<Text style={styles.cardLabel}>Snap and find</Text>
							<View style={styles.wideCircle}>
								<Image
									source={{ uri: pictureUrl(index.manifest, categories[0]?.product.picture ?? 0, "s") }}
									style={styles.fill}
									contentFit="contain"
								/>
							</View>
						</Pressable>
						<View style={styles.grid}>
							{categories.map((category) => (
								<Pressable
									key={category.name}
									onPress={() => onCategory(category.name)}
									style={({ pressed }) => [styles.card, { width: card, height: card * 1.16 }, pressed && { opacity: 0.85 }]}
								>
									<Image
										source={{ uri: pictureUrl(index.manifest, category.product.picture) }}
										style={styles.cardImage}
										contentFit="contain"
									/>
									<Text style={styles.cardLabel} numberOfLines={2}>
										{category.name}
									</Text>
								</Pressable>
							))}
						</View>
					</>
				) : recentSearches.length ? (
					recentSearches.map((query) => (
						<Pressable key={query} onPress={() => submit(query)} style={styles.recentRow}>
							<Ionicons name="time-outline" size={22} color={colors.muted} />
							<Text style={styles.recentText}>{query}</Text>
						</Pressable>
					))
				) : (
					<Text style={styles.empty}>Searches you type will show up here.</Text>
				)}
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	screen: { flex: 1, backgroundColor: colors.background },
	searchRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 24 },
	field: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		backgroundColor: colors.field,
		borderRadius: 999,
		paddingHorizontal: 20,
		height: 60,
	},
	input: { flex: 1, color: colors.text, fontFamily: fonts.regular, fontSize: 18 },
	tabs: {
		flexDirection: "row",
		gap: 36,
		marginHorizontal: 24,
		marginTop: 22,
		borderBottomWidth: 2,
		borderBottomColor: colors.divider,
		alignSelf: "flex-start",
	},
	tab: { paddingBottom: 12, marginBottom: -2, borderBottomWidth: 3, borderBottomColor: "transparent", paddingHorizontal: 8 },
	tabActive: { borderBottomColor: colors.text },
	tabText: { color: colors.muted, fontFamily: fonts.bold, fontSize: 18 },
	tabTextActive: { color: colors.text },
	content: { padding: 24, gap: 12 },
	wide: {
		backgroundColor: "#f5f5f5",
		borderRadius: 4,
		height: 210,
		padding: 28,
		justifyContent: "space-between",
		overflow: "hidden",
	},
	wideIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: "white", alignItems: "center", justifyContent: "center" },
	wideCircle: {
		position: "absolute",
		right: -20,
		top: -10,
		width: 190,
		height: 190,
		borderRadius: 95,
		borderWidth: 8,
		borderColor: "white",
		backgroundColor: "white",
		overflow: "hidden",
	},
	fill: { flex: 1 },
	grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
	// White, not IKEA's light grey: the product photos have white backgrounds and would show as boxes on grey.
	card: { backgroundColor: colors.tile, borderRadius: 4, padding: 20, justifyContent: "space-between" },
	cardImage: { flex: 1, marginBottom: 12 },
	cardLabel: { color: colors.tileText, fontFamily: fonts.regular, fontSize: 17, lineHeight: 23 },
	recentRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14 },
	recentText: { color: colors.text, fontFamily: fonts.regular, fontSize: 17 },
	empty: { color: colors.muted, fontFamily: fonts.regular, fontSize: 15, textAlign: "center", marginTop: 40 },
});
