import { File, Paths } from "expo-file-system";
import type { Country } from "./lens-index";

export interface Settings {
	/** Which IKEA.com product links open: the dataset is the US catalogue, but most products exist in Canada too. */
	country: Country;
}

const DEFAULTS: Settings = { country: "us" };
const file = () => new File(Paths.document, "settings.json");

export function readSettings(): Settings {
	try {
		return file().exists ? { ...DEFAULTS, ...(JSON.parse(file().textSync()) as Partial<Settings>) } : DEFAULTS;
	} catch {
		return DEFAULTS;
	}
}

export function writeSettings(settings: Settings): void {
	const target = file();
	if (!target.exists) target.create();
	target.writeSync(JSON.stringify(settings));
}
