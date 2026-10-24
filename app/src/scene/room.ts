import { Directory, File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { type Hit, type LensIndex, search } from "../lens-index";
import { embedImage } from "../model";
import { loadSceneModels } from "./models";
import { analyzeScene, overlayPng, type SceneObject } from "./scene";

/**
 * A cutout whose best catalogue match scores below this is probably not a product (a slice of a desk, a window, a
 * cushion the catalogue doesn't have) and is left out. On IKEA room photos, matches that looked right scored
 * 0.86–0.92 and wrong ones 0.76–0.86; see docs/room-scan.md. Measured with the PC's model; the phone's may score a
 * little differently.
 */
export const MIN_MATCH = 0.85;

export interface RoomObject extends Omit<SceneObject, "cutout"> {
	/** 1, 2, 3… left to right, as the dots on the photo show. */
	number: number;
	cutoutUri: string;
	/** Best catalogue matches, best first. */
	hits: Hit[];
}

export interface RoomScan {
	photoUri: string;
	/** The objects' masks in colour, to lay over the photo. */
	overlayUri: string;
	/** Width / height. */
	aspect: number;
	objects: RoomObject[];
	/** Things found that didn't match the catalogue well enough to show. */
	skipped: number;
	ms: number;
}

/** Find the catalogue products in a room photo. */
export async function scanRoom(photoUri: string, index: LensIndex, onStep: (step: string) => void): Promise<RoomScan> {
	const started = Date.now();
	const folder = new Directory(Paths.cache, `room-${started}`);
	folder.create({ intermediates: true });

	// About 1024 px on the long side: the models work at 768 and 1024, and decoding a 12-megapixel JPEG in JavaScript
	// would take seconds.
	const original = await ImageManipulator.manipulate(photoUri).renderAsync();
	const landscape = original.width >= original.height;
	const resized = await ImageManipulator.manipulate(original)
		.resize(landscape ? { width: Math.min(1024, original.width) } : { height: Math.min(1024, original.height) })
		.renderAsync();
	const saved = await resized.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
	const aspect = resized.width / resized.height;
	original.release();
	resized.release();

	onStep("Loading the room scan…");
	const models = await loadSceneModels();
	let found: SceneObject[];
	try {
		found = await analyzeScene(await new File(saved.uri).bytes(), models, { onStep });
	} finally {
		// Free them before the embedding model gets to work.
		models.release();
	}

	const matched: (SceneObject & { cutoutUri: string; hits: Hit[] })[] = [];
	for (let i = 0; i < found.length; i++) {
		onStep(`Matching ${i + 1} of ${found.length}…`);
		const file = new File(folder, `${i}.png`);
		await file.write(found[i].cutout);
		const hits = search(index, await embedImage(file.uri, index.manifest.dims), 6);
		if (hits.length && hits[0].score >= MIN_MATCH) matched.push({ ...found[i], cutoutUri: file.uri, hits });
	}
	matched.sort((a, b) => a.centre[0] - b.centre[0]);

	const objects: RoomObject[] = matched.map(({ cutout, ...object }, i) => ({ ...object, number: i + 1 }));
	const overlay = new File(folder, "overlay.png");
	await overlay.write(overlayPng(objects, aspect));
	return { photoUri: saved.uri, overlayUri: overlay.uri, aspect, objects, skipped: found.length - objects.length, ms: Date.now() - started };
}
