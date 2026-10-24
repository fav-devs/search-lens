import { Directory, File, Paths } from "expo-file-system";
import { embedImage } from "./model";

// The index the PC tool writes (pc/lens/index.py): manifest.json, then vectors.bin with `count` rows of `dims` int8
// numbers followed by `count` float32 scales, so picture i's unit vector is row i × scale i.
const FORMAT = "product-lens-index";

export interface Product {
	id: string;
	title: string;
	price: number;
	url: string;
	category: string;
	/** Row of the picture this product is shown with; variants (Queen/King) often share one. */
	picture: number;
}

export interface Manifest {
	format: typeof FORMAT;
	version: number;
	model: string;
	visionTokens: number;
	queryPrefix: string;
	dims: number;
	count: number;
	created: string;
	imageBase: string;
	imageSize: string;
	/** Each picture's file name on IKEA's image server, in vector order. */
	pictures: string[];
	products: Product[];
}

export interface LensIndex {
	manifest: Manifest;
	vectors: Int8Array;
	scales: Float32Array;
	productsByPicture: Product[][];
}

export interface Hit {
	picture: number;
	score: number;
	products: Product[];
}

function indexDirectory(): Directory {
	const directory = new Directory(Paths.document, "index");
	directory.create({ intermediates: true, idempotent: true });
	return directory;
}

function open(manifest: Manifest, bytes: Uint8Array): LensIndex {
	const { count, dims } = manifest;
	if (bytes.byteLength !== count * dims + count * 4) throw new Error("vectors.bin doesn't match manifest.json");
	const vectors = new Int8Array(bytes.buffer, bytes.byteOffset, count * dims);
	// Copied so the floats start on a 4-byte boundary whatever offset the file's buffer has.
	const scales = new Float32Array(bytes.slice(count * dims).buffer);
	const productsByPicture: Product[][] = Array.from({ length: count }, () => []);
	for (const product of manifest.products) productsByPicture[product.picture]?.push(product);
	return { manifest, vectors, scales, productsByPicture };
}

export async function loadIndex(): Promise<LensIndex | null> {
	const directory = indexDirectory();
	const manifestFile = new File(directory, "manifest.json");
	const vectorsFile = new File(directory, "vectors.bin");
	if (!manifestFile.exists || !vectorsFile.exists) return null;
	const manifest = JSON.parse(await manifestFile.text()) as Manifest;
	return open(manifest, await vectorsFile.bytes());
}

/** "192.168.1.20:8765" or a scanned "http://192.168.1.20:8765/" → "http://192.168.1.20:8765/". */
export function normaliseAddress(address: string): string {
	let url = address.trim();
	if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
	return url.endsWith("/") ? url : `${url}/`;
}

/** Copy the index from `lens serve` on the PC. The old index stays until the new one has arrived whole. */
export async function importIndex(address: string, onProgress: (message: string) => void): Promise<LensIndex> {
	const base = normaliseAddress(address);
	const directory = indexDirectory();
	const incoming = new Directory(directory, "incoming");
	if (incoming.exists) incoming.delete();
	incoming.create({ intermediates: true });

	onProgress("Fetching the product list…");
	const manifestFile = await File.downloadFileAsync(`${base}manifest.json`, new File(incoming, "manifest.json"));
	const manifest = JSON.parse(await manifestFile.text()) as Manifest;
	if (manifest.format !== FORMAT) throw new Error("That address isn't serving a Product Lens index.");

	const vectorsFile = await File.downloadFileAsync(`${base}vectors.bin`, new File(incoming, "vectors.bin"), {
		onProgress: ({ bytesWritten, totalBytes }) => {
			if (totalBytes > 0) onProgress(`Fetching vectors… ${Math.round((bytesWritten / totalBytes) * 100)}%`);
		},
	});
	const index = open(manifest, await vectorsFile.bytes());

	for (const name of ["manifest.json", "vectors.bin"]) {
		const current = new File(directory, name);
		if (current.exists) current.delete();
		await new File(incoming, name).move(current);
	}
	incoming.delete();
	return index;
}

/** The pictures closest to `query` (a unit vector of `dims` numbers), best first. Scores are cosine similarities. */
export function search(index: LensIndex, query: number[], limit = 10): Hit[] {
	const { count, dims } = index.manifest;
	if (query.length !== dims) throw new Error(`Expected a ${dims}-number vector, got ${query.length}`);
	const q = Float32Array.from(query);
	const v = index.vectors;
	const scales = index.scales;
	const bestScore = new Float64Array(limit).fill(-Infinity);
	const bestRow = new Int32Array(limit).fill(-1);

	for (let row = 0, base = 0; row < count; row++, base += dims) {
		// Four running sums: fewer dependent additions per step on Hermes. dims is a multiple of 128.
		let a = 0;
		let b = 0;
		let c = 0;
		let d = 0;
		for (let k = 0; k < dims; k += 4) {
			a += q[k] * v[base + k];
			b += q[k + 1] * v[base + k + 1];
			c += q[k + 2] * v[base + k + 2];
			d += q[k + 3] * v[base + k + 3];
		}
		const score = (a + b + c + d) * scales[row];
		if (score <= bestScore[limit - 1]) continue;
		let slot = limit - 1;
		while (slot > 0 && bestScore[slot - 1] < score) {
			bestScore[slot] = bestScore[slot - 1];
			bestRow[slot] = bestRow[slot - 1];
			slot--;
		}
		bestScore[slot] = score;
		bestRow[slot] = row;
	}

	const hits: Hit[] = [];
	for (let i = 0; i < limit && bestRow[i] >= 0; i++) {
		hits.push({ picture: bestRow[i], score: bestScore[i], products: index.productsByPicture[bestRow[i]] });
	}
	return hits;
}

export function pictureUrl(manifest: Manifest, picture: number, size = manifest.imageSize): string {
	return `${manifest.imageBase}${encodeURIComponent(manifest.pictures[picture])}?f=${size}`;
}

/** IKEA writes article numbers as 105.800.70. */
export function articleNumber(id: string): string {
	return id.length === 8 ? `${id.slice(0, 3)}.${id.slice(3, 6)}.${id.slice(6)}` : id;
}

/**
 * Embed a few catalogue pictures on the phone (the same files the PC embedded) and compare with the index. If the phone
 * and the PC agree, each picture comes back as its own best match with a similarity close to 1.
 */
export async function checkAgainstPC(
	index: LensIndex,
	samples = 6,
): Promise<{ similarity: number; foundFirst: number; samples: number; msPerPicture: number }> {
	const { manifest } = index;
	const cache = new Directory(Paths.cache, "check");
	if (cache.exists) cache.delete();
	cache.create({ intermediates: true });
	let similarity = 0;
	let foundFirst = 0;
	let embedMs = 0;
	for (let n = 0; n < samples; n++) {
		const picture = Math.floor(Math.random() * manifest.count);
		const file = await File.downloadFileAsync(pictureUrl(manifest, picture), new File(cache, `${n}.jpg`));
		const started = Date.now();
		const vector = await embedImage(file.uri, manifest.dims);
		embedMs += Date.now() - started;
		let dot = 0;
		const base = picture * manifest.dims;
		for (let k = 0; k < manifest.dims; k++) dot += vector[k] * index.vectors[base + k];
		similarity += dot * index.scales[picture];
		if (search(index, vector, 1)[0]?.picture === picture) foundFirst++;
	}
	cache.delete();
	return { similarity: similarity / samples, foundFirst, samples, msPerPicture: embedMs / samples };
}
