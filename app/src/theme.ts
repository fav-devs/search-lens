// The look of the IKEA app (dark theme): near-black screens, a dark grey sheet, light product tiles, IKEA blue for the
// main action and the yellow accent. Noto Sans stands in for IKEA's own Noto IKEA, which isn't published.
export const colors = {
	background: "#111111",
	sheet: "#232323",
	field: "#2e2e2e",
	divider: "#3d3d3d",
	tile: "#ffffff",
	tileText: "#111111",
	text: "#ffffff",
	muted: "#a3a3a3",
	blue: "#0058a3",
	blueText: "#2f8ee0",
	tag: "#47a9e0",
	yellow: "#ffdb00",
	green: "#2fbf4a",
	warn: "#f0a530",
	overlay: "rgba(140,140,140,0.55)",
} as const;

export const fonts = {
	regular: "NotoSans_400Regular",
	medium: "NotoSans_500Medium",
	semibold: "NotoSans_600SemiBold",
	bold: "NotoSans_700Bold",
	heavy: "NotoSans_800ExtraBold",
} as const;
