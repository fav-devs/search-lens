import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { type ReactNode, useEffect, useState } from "react";
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { splitTitle } from "../format";
import {
	articleNumber,
	type Country,
	type LensIndex,
	loadDetails,
	type Product,
	type ProductDetails,
	pictureUrl,
	productLink,
} from "../lens-index";
import { colors, fonts } from "../theme";
import { CircleButton, MatchBadge, PillButton, Price } from "../ui";

export interface OpenProduct {
	product: Product;
	/** How close it was to the photo or description, when it came from a search. */
	score?: number;
}

/** The product page: what the photo matched, with everything the dataset knows about it and a way into IKEA's app. */
export function ProductSheet(props: {
	open: OpenProduct | null;
	index: LensIndex;
	country: Country;
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
			<SafeAreaProvider style={StyleSheet.absoluteFill}>
				{props.open ? <ProductPage key={props.open.product.id} {...props} open={props.open} /> : null}
			</SafeAreaProvider>
		</Modal>
	);
}

function ProductPage({
	open: { product, score },
	index,
	country,
	saved,
	onToggleSaved,
	onClose,
	onSimilar,
	onCategory,
}: Parameters<typeof ProductSheet>[0] & { open: OpenProduct }) {
	const insets = useSafeAreaInsets();
	const { width } = useWindowDimensions();
	const { name, description } = splitTitle(product.title);
	// undefined while loading, null when this index has no details (built before the PC tool wrote them).
	const [details, setDetails] = useState<ProductDetails | null | undefined>(undefined);
	const [expanded, setExpanded] = useState<"details" | "materials" | null>("details");
	const link = productLink(product.url, country);
	const openInIkea = () => Linking.openURL(link);

	useEffect(() => {
		loadDetails(index, product.id).then(setDetails, () => setDetails(null));
	}, [index, product.id]);

	const toggle = (section: "details" | "materials") => setExpanded((current) => (current === section ? null : section));

	return (
		<View style={styles.screen}>
			<ScrollView contentContainerStyle={{ paddingBottom: 170 + insets.bottom }} bounces={false}>
				<View style={[styles.photo, { height: width * 1.05, paddingTop: insets.top }]}>
					<Image source={{ uri: pictureUrl(index.manifest, product.picture, "m") }} style={styles.fill} contentFit="contain" transition={150} />
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
						<Section title="Product details" open={expanded === "details"} onPress={() => toggle("details")}>
							{details === undefined ? (
								<ActivityIndicator color={colors.muted} style={{ alignSelf: "flex-start" }} />
							) : details === null ? (
								<Text style={styles.muted}>This index has no product details. Run `lens` on the PC again and re-import it.</Text>
							) : !details.description && !details.goodToKnow.length ? (
								<Text style={styles.muted}>The catalogue has no description for this product.</Text>
							) : (
								<>
									{details.description ? <Text style={styles.body}>{details.description}</Text> : null}
									{details.goodToKnow.length ? (
										<>
											<Text style={styles.subheading}>Good to know</Text>
											<Bullets lines={details.goodToKnow} />
										</>
									) : null}
								</>
							)}
						</Section>
						{details && (details.materials.length > 0 || details.care.length > 0) ? (
							<Section title="Materials & care" open={expanded === "materials"} onPress={() => toggle("materials")}>
								{details.materials.length ? (
									<>
										<Text style={styles.subheading}>Materials</Text>
										<Bullets lines={details.materials} />
									</>
								) : null}
								{details.care.length ? (
									<>
										<Text style={styles.subheading}>Care</Text>
										<Bullets lines={details.care} />
									</>
								) : null}
							</Section>
						) : null}
						<Row title="Similar products" onPress={() => onSimilar(product)} />
						<Row
							title={product.category || "Category"}
							subtitle={details?.path.length ? details.path.join(" › ") : "More in this category"}
							onPress={() => onCategory(product.category)}
						/>
					</View>

					<View style={styles.idBlock}>
						<Text style={styles.subheading}>Product ID</Text>
						<Field label="Article number" value={articleNumber(product.id)} />
						<Field label="IKEA.com" value={link.replace(/^https:\/\/www\./, "")} onPress={openInIkea} />
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

			<View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
				<PillButton title="Open in IKEA" onPress={openInIkea} />
				<Text style={styles.footnote}>Opens the IKEA app if it’s installed, otherwise IKEA.com</Text>
			</View>
		</View>
	);
}

function Section({ title, open, onPress, children }: { title: string; open: boolean; onPress: () => void; children: ReactNode }) {
	return (
		<View style={styles.section}>
			<Pressable onPress={onPress} style={({ pressed }) => [styles.rowHead, pressed && { opacity: 0.6 }]}>
				<Text style={[styles.rowTitle, { flex: 1 }]}>{title}</Text>
				<Ionicons name={open ? "chevron-up" : "chevron-down"} size={26} color={colors.text} />
			</Pressable>
			{open ? <View style={styles.sectionBody}>{children}</View> : null}
		</View>
	);
}

function Row({ title, subtitle, onPress }: { title: string; subtitle?: string; onPress: () => void }) {
	return (
		<Pressable onPress={onPress} style={({ pressed }) => [styles.section, styles.rowHead, pressed && { opacity: 0.6 }]}>
			<View style={styles.rowText}>
				<Text style={styles.rowTitle}>{title}</Text>
				{subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
			</View>
			<Ionicons name="chevron-forward" size={28} color={colors.text} />
		</Pressable>
	);
}

function Bullets({ lines }: { lines: string[] }) {
	return (
		<View style={styles.bullets}>
			{lines.map((line, i) => (
				<View key={i} style={styles.bulletRow}>
					<Text style={styles.body}>•</Text>
					<Text style={[styles.body, styles.bulletText]}>{line}</Text>
				</View>
			))}
		</View>
	);
}

function Field({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
	return (
		<Pressable onPress={onPress} disabled={!onPress} style={styles.field}>
			<Text style={styles.fieldLabel}>{label}</Text>
			<Text style={[styles.fieldValue, onPress && styles.link]} selectable numberOfLines={2}>
				{value}
			</Text>
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
	section: { borderBottomWidth: 1, borderBottomColor: colors.divider },
	rowHead: { flexDirection: "row", alignItems: "center", paddingVertical: 26 },
	sectionBody: { paddingBottom: 26, gap: 12 },
	rowText: { flex: 1, gap: 2 },
	rowTitle: { color: colors.text, fontFamily: fonts.bold, fontSize: 18 },
	rowSubtitle: { color: colors.muted, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
	subheading: { color: colors.text, fontFamily: fonts.bold, fontSize: 16, marginTop: 4 },
	body: { color: colors.text, fontFamily: fonts.regular, fontSize: 16, lineHeight: 24 },
	muted: { color: colors.muted, fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
	bullets: { gap: 8 },
	bulletRow: { flexDirection: "row", gap: 10 },
	bulletText: { flex: 1 },
	idBlock: { marginTop: 28, gap: 14 },
	field: { gap: 2 },
	fieldLabel: { color: colors.muted, fontFamily: fonts.regular, fontSize: 14 },
	fieldValue: { color: colors.text, fontFamily: fonts.regular, fontSize: 16 },
	link: { color: colors.blueText, textDecorationLine: "underline" },
	corner: { position: "absolute" },
	footer: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		paddingHorizontal: 24,
		paddingTop: 16,
		gap: 10,
		backgroundColor: colors.sheet,
	},
	footnote: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, textAlign: "center" },
});
