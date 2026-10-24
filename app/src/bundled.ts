import { Asset } from "expo-asset";
import { Directory, File } from "expo-file-system";
import { incomingDirectory, indexSource, installIncoming, type LensIndex, openFiles } from "./lens-index";

// The index built into the app by `lens bundle` (pc/lens/pack.py): one file, "SLPACK1\n", a uint32 header size, an
// ASCII JSON header listing the entries, then their bytes. Installed into the same place a Wi-Fi import goes, the
// first time the app opens, so a fresh install needs no PC.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const BUNDLED: number | null = require("searchlens-bundled-index");

export const hasBundledIndex = BUNDLED !== null;

interface PackHeader {
	format: string;
	version: number;
	created: string;
	entries: { name: string; offset: number; size: number }[];
}

const ascii = (bytes: Uint8Array) => String.fromCharCode(...bytes);

/**
 * Whether the bundled index should be installed now: there's no index yet, or the one there came from an older
 * bundle (the app was updated). An index imported from the PC is never replaced by the bundle.
 */
export function bundledIndexWanted(installed: LensIndex | null): boolean {
	if (!hasBundledIndex) return false;
	if (!installed) return true;
	return indexSource()?.source === "bundle";
}

/** Copy the bundled index into place and open it. Returns null if the installed one is already this bundle. */
export async function installBundledIndex(installed: LensIndex | null, onProgress: (fraction: number) => void): Promise<LensIndex | null> {
	if (BUNDLED === null) return null;
	const asset = Asset.fromModule(BUNDLED);
	// On Android the asset is inside the APK and is copied out first; on iOS it is read in place.
	await asset.downloadAsync();
	if (!asset.localUri) throw new Error("The bundled index couldn't be read");
	const handle = new File(asset.localUri).open();
	try {
		const start = handle.readBytesSync(12);
		if (ascii(start.subarray(0, 8)) !== "SLPACK1\n") throw new Error("The bundled index is damaged");
		const headerSize = new DataView(start.buffer, start.byteOffset + 8, 4).getUint32(0, true);
		const header = JSON.parse(ascii(handle.readBytesSync(headerSize))) as PackHeader;
		if (installed && indexSource()?.created === header.created) return null;

		const incoming = incomingDirectory();
		const base = 12 + headerSize;
		const total = header.entries.reduce((sum, e) => sum + e.size, 0);
		let copied = 0;
		for (const entry of header.entries) {
			const parts = entry.name.split("/");
			const folder = parts.length > 1 ? new Directory(incoming, ...parts.slice(0, -1)) : incoming;
			folder.create({ intermediates: true, idempotent: true });
			handle.offset = base + entry.offset;
			const file = new File(folder, parts[parts.length - 1]);
			file.create();
			file.writeSync(await handle.readBytes(entry.size));
			copied += entry.size;
			onProgress(copied / total);
		}
		const index = await openFiles(incoming);
		await installIncoming(index.manifest, { source: "bundle", created: header.created });
		return index;
	} finally {
		handle.close();
	}
}
