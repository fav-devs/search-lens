/**
 * IKEA titles start with the product name in capitals: `HÅLLBAR bin with lid, light gray, 22 l` →
 * `{ name: "HÅLLBAR", description: "Bin with lid, light gray, 22 l" }`. Names can be several words (`SKYDRAG / TRÅDFRI`).
 */
export function splitTitle(title: string): { name: string; description: string } {
	const words = title.split(" ");
	let n = 0;
	while (n < words.length && (words[n] === "/" || (/\p{Lu}/u.test(words[n]) && words[n] === words[n].toUpperCase()))) n++;
	const name = words.slice(0, n).join(" ");
	const rest = words.slice(n).join(" ");
	return { name, description: rest.charAt(0).toUpperCase() + rest.slice(1) };
}

/** $14.99 → { dollars: "14", cents: ".99" }; whole prices have no cents, as on IKEA's price tags. */
export function priceParts(price: number): { dollars: string; cents: string } {
	const [dollars, cents] = price.toFixed(2).split(".");
	return { dollars: Number(dollars).toLocaleString("en-US"), cents: cents === "00" ? "" : `.${cents}` };
}
