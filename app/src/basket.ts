import { File, Paths } from "expo-file-system";

/** Product id → how many. Kept on the phone; the app can't add to IKEA's own cart. */
export type Basket = Record<string, number>;

const file = () => new File(Paths.document, "basket.json");

export function readBasket(): Basket {
	try {
		return file().exists ? (JSON.parse(file().textSync()) as Basket) : {};
	} catch {
		return {};
	}
}

export function writeBasket(basket: Basket): void {
	const target = file();
	if (!target.exists) target.create();
	target.writeSync(JSON.stringify(basket));
}

/** The basket with `id` set to `quantity` (removed at 0). */
export function withQuantity(basket: Basket, id: string, quantity: number): Basket {
	const next = { ...basket };
	if (quantity > 0) next[id] = Math.min(99, quantity);
	else delete next[id];
	return next;
}

export const basketCount = (basket: Basket) => Object.values(basket).reduce((sum, n) => sum + n, 0);
