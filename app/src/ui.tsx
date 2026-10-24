import Ionicons from "@expo/vector-icons/Ionicons";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import type { ComponentProps, ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, type TextStyle, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { priceParts, splitTitle } from "./format";
import { type Manifest, type Product, pictureUrl } from "./lens-index";
import { colors, fonts } from "./theme";

export type IconName = ComponentProps<typeof Ionicons>["name"];

/** The round buttons on IKEA's screens: dark grey (bell), see-through grey (close over a photo), black (favourite). */
export function CircleButton({
	icon,
	onPress,
	variant = "dark",
	size = 52,
	style,
}: {
	icon: IconName;
	onPress: () => void;
	variant?: "dark" | "overlay" | "black" | "light";
	size?: number;
	style?: ViewStyle;
}) {
	const background = { dark: colors.field, overlay: colors.overlay, black: "#000000", light: "#ffffff" }[variant];
	return (
		<Pressable
			onPress={onPress}
			hitSlop={8}
			style={({ pressed }) => [
				{ width: size, height: size, borderRadius: size / 2, backgroundColor: background },
				styles.circle,
				pressed && { opacity: 0.7 },
				style,
			]}
		>
			<Ionicons name={icon} size={size * 0.5} color={variant === "light" ? colors.tileText : colors.text} />
		</Pressable>
	);
}

/** IKEA's full-width rounded button: blue for the main action. */
export function PillButton({
	title,
	onPress,
	variant = "blue",
	busy,
	style,
}: {
	title: string;
	onPress: () => void;
	variant?: "blue" | "dark";
	busy?: boolean;
	style?: ViewStyle;
}) {
	return (
		<Pressable
			onPress={onPress}
			disabled={busy}
			style={({ pressed }) => [
				styles.pill,
				{ backgroundColor: variant === "blue" ? colors.blue : colors.field },
				pressed && { opacity: 0.8 },
				style,
			]}
		>
			{busy ? <ActivityIndicator color={colors.text} /> : <Text style={styles.pillText}>{title}</Text>}
		</Pressable>
	);
}

/** $14.99 the IKEA way: small raised dollar sign and cents around big dollars. */
export function Price({ price, size = 44, color = colors.text }: { price: number; size?: number; color?: string }) {
	const { dollars, cents } = priceParts(price);
	const small: TextStyle = { fontFamily: fonts.bold, fontSize: size * 0.48, lineHeight: size * 0.62, color };
	return (
		<View style={styles.price}>
			<Text style={small}>$</Text>
			<Text style={{ fontFamily: fonts.heavy, fontSize: size, lineHeight: size * 1.1, color, letterSpacing: -0.5 }}>
				{dollars}
			</Text>
			{cents ? <Text style={small}>{cents}</Text> : null}
		</View>
	);
}

/** A product as IKEA lists it: the picture on a light tile, then NAME, what it is, and the price. */
export function ProductCard({
	product,
	manifest,
	width,
	onPress,
	badge,
}: {
	product: Product;
	manifest: Manifest;
	width: number;
	onPress: () => void;
	badge?: ReactNode;
}) {
	const { name, description } = splitTitle(product.title);
	return (
		<Pressable onPress={onPress} style={({ pressed }) => [{ width }, pressed && { opacity: 0.75 }]}>
			<View style={[styles.tile, { width, height: width }]}>
				<Image
					source={{ uri: pictureUrl(manifest, product.picture) }}
					style={styles.tileImage}
					contentFit="contain"
					transition={150}
				/>
			</View>
			<View style={styles.cardText}>
				{badge}
				<Text style={styles.cardName} numberOfLines={1}>
					{name || description}
				</Text>
				<Text style={styles.cardDescription} numberOfLines={2}>
					{name ? description : ""}
				</Text>
				<Price price={product.price} size={22} />
			</View>
		</Pressable>
	);
}

/** "● 92% match", in the place IKEA shows "● In stock". */
export function MatchBadge({ score, large }: { score: number; large?: boolean }) {
	return (
		<View style={styles.badge}>
			<View style={[styles.dot, { backgroundColor: score > 0.8 ? colors.green : colors.warn }]} />
			<Text style={[styles.badgeText, large && { fontSize: 17 }]}>{Math.round(score * 100)}% match</Text>
		</View>
	);
}

export type Tab = "home" | "search" | "you";

/** The floating glass tab bar. Scan sits between the tabs, as IKEA's search sits beside the scanner. */
export function TabBar({ tab, onTab, onScan }: { tab: Tab; onTab: (tab: Tab) => void; onScan: () => void }) {
	const insets = useSafeAreaInsets();
	const items: { key: Tab | "scan"; icon: IconName; active: IconName }[] = [
		{ key: "home", icon: "home-outline", active: "home" },
		{ key: "search", icon: "search-outline", active: "search" },
		{ key: "scan", icon: "scan-outline", active: "scan" },
		{ key: "you", icon: "person-outline", active: "person" },
	];
	return (
		<View pointerEvents="box-none" style={[styles.tabWrap, { bottom: Math.max(insets.bottom, 12) }]}>
			<BlurView intensity={40} tint="dark" style={styles.tabBar}>
				{items.map((item) => {
					const selected = item.key === tab;
					return (
						<Pressable
							key={item.key}
							onPress={() => (item.key === "scan" ? onScan() : onTab(item.key))}
							style={[styles.tabItem, selected && styles.tabSelected]}
							hitSlop={4}
						>
							<Ionicons name={selected ? item.active : item.icon} size={27} color={colors.text} />
						</Pressable>
					);
				})}
			</BlurView>
		</View>
	);
}

/** Space a scrolling screen leaves at the bottom so its last row clears the tab bar. */
export const TAB_BAR_SPACE = 110;

const styles = StyleSheet.create({
	circle: { alignItems: "center", justifyContent: "center" },
	pill: { borderRadius: 999, minHeight: 60, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
	pillText: { color: colors.text, fontFamily: fonts.bold, fontSize: 17 },
	price: { flexDirection: "row", alignItems: "flex-start" },
	tile: { backgroundColor: colors.tile, borderRadius: 4, overflow: "hidden" },
	tileImage: { flex: 1, margin: "8%" },
	cardText: { paddingTop: 10, gap: 2 },
	cardName: { color: colors.text, fontFamily: fonts.bold, fontSize: 14 },
	cardDescription: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, minHeight: 36 },
	badge: { flexDirection: "row", alignItems: "center", gap: 8 },
	dot: { width: 10, height: 10, borderRadius: 5 },
	badgeText: { color: colors.text, fontFamily: fonts.semibold, fontSize: 13 },
	tabWrap: { position: "absolute", left: 20, right: 20 },
	tabBar: {
		flexDirection: "row",
		justifyContent: "space-around",
		alignItems: "center",
		borderRadius: 40,
		overflow: "hidden",
		paddingHorizontal: 8,
		height: 72,
		backgroundColor: "rgba(110,110,110,0.45)",
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: "rgba(255,255,255,0.25)",
	},
	tabItem: { width: 76, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
	tabSelected: { backgroundColor: "rgba(40,40,40,0.75)" },
});
