import { EDGETAM_NO_MEMORY } from "./edgetam-constants";
import { decodeJpeg, encodePng, type Pixels, sample, toTensor } from "./image";
import { THING_TOKENS, THINGS } from "./vocabulary";

// Room scan: find the things in a photo, cut each out on white the way the catalogue shows products, so the
// embedding model can match it. Three steps, all in plain TypeScript around two ONNX models:
//   1. OWL-ViT (Google, Apache-2.0) finds boxes for the things in vocabulary.ts. A detector that is told what to
//      look for finds whole products; a "segment everything" grid of taps found parts of them instead (a chair's
//      back, its seat, its legs) and cost hundreds of model runs.
//   2. EdgeTAM (Meta, Apache-2.0) turns each box into a mask: given the box around a chair, it outlines the chair.
//   3. Each mask becomes a 448 px PNG of the object on white, ready for embedImage and the catalogue search.

export interface Tensor {
	dims: number[];
	data: Float32Array;
}

/**
 * Runs the three ONNX graphs. On the phone this is the native bridge in modules/gemma-embed; in tests it is
 * onnxruntime-node. Integer inputs (token ids, prompt labels) arrive as floats and are converted to the model's type.
 */
export interface SceneModels {
	run(model: "detector" | "encoder" | "decoder", inputs: Record<string, Tensor>, outputs: string[]): Promise<Record<string, Tensor>>;
}

export interface SceneObject {
	/** What the detector called it ("chair", "lamp"); the catalogue match says what it really is. */
	label: string;
	detectorScore: number;
	/** Fractions of the photo's width and height. */
	box: [number, number, number, number];
	/** Where to put its numbered dot: the middle of the mask, as fractions. */
	centre: [number, number];
	/** Share of the photo the object covers. */
	area: number;
	/** The object on white, 448 × 448, as a PNG file's bytes. */
	cutout: Uint8Array;
	/** 256 × 256 mask logits over the whole photo (stretched to a square); above 0 is the object. */
	mask: Float32Array;
}

export interface SceneOptions {
	/** Detector confidence to keep a box (0–1). */
	threshold?: number;
	/** At most this many objects. */
	limit?: number;
	onStep?: (step: string) => void;
}

const MASK = 256;
const CUTOUT = 448;
const OWL_SIZE = 768;
const EDGETAM_SIZE = 1024;
const OWL_MEAN = [0.48145466, 0.4578275, 0.40821073];
const OWL_STD = [0.26862954, 0.26130258, 0.27577711];
const IMAGENET_MEAN = [0.485, 0.456, 0.406];
const IMAGENET_STD = [0.229, 0.224, 0.225];

type Box = [number, number, number, number];

function boxIou(a: Box, b: Box): number {
	const w = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
	const h = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
	const inter = w * h;
	return inter / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter + 1e-9);
}

function maskIou(a: Float32Array, b: Float32Array): number {
	let inter = 0;
	let union = 0;
	for (let i = 0; i < a.length; i++) {
		const x = a[i] > 0;
		const y = b[i] > 0;
		if (x && y) inter++;
		if (x || y) union++;
	}
	return union ? inter / union : 0;
}

/** 1. Boxes for the things in the vocabulary, best first, overlapping duplicates removed. */
async function detect(models: SceneModels, photo: Pixels, threshold: number, limit: number) {
	const queries = THING_TOKENS.length;
	const ids = new Float32Array(queries * 16);
	const attention = new Float32Array(queries * 16);
	THING_TOKENS.forEach((tokens, q) =>
		tokens.forEach((token, i) => {
			ids[q * 16 + i] = token;
			attention[q * 16 + i] = token === 0 ? 0 : 1;
		}),
	);
	const out = await models.run(
		"detector",
		{
			input_ids: { dims: [queries, 16], data: ids },
			attention_mask: { dims: [queries, 16], data: attention },
			pixel_values: { dims: [1, 3, OWL_SIZE, OWL_SIZE], data: toTensor(photo, OWL_SIZE, OWL_MEAN, OWL_STD) },
		},
		["logits", "pred_boxes"],
	);
	const logits = out.logits.data;
	const boxes = out.pred_boxes.data;
	const patches = out.pred_boxes.dims[1];
	const candidates: { box: Box; score: number; label: string }[] = [];
	for (let p = 0; p < patches; p++) {
		let best = -Infinity;
		let which = 0;
		for (let q = 0; q < queries; q++) {
			const value = logits[p * queries + q];
			if (value > best) {
				best = value;
				which = q;
			}
		}
		const score = 1 / (1 + Math.exp(-best));
		if (score < threshold) continue;
		const [cx, cy, w, h] = boxes.subarray(p * 4, p * 4 + 4);
		const box: Box = [Math.max(0, cx - w / 2), Math.max(0, cy - h / 2), Math.min(1, cx + w / 2), Math.min(1, cy + h / 2)];
		// A box over most of the photo is the room, not a thing in it.
		if ((box[2] - box[0]) * (box[3] - box[1]) > 0.6) continue;
		candidates.push({ box, score, label: THINGS[which] });
	}
	candidates.sort((a, b) => b.score - a.score);
	const kept: typeof candidates = [];
	for (const candidate of candidates) {
		if (kept.length >= limit) break;
		if (kept.some((k) => boxIou(k.box, candidate.box) > 0.4)) continue;
		kept.push(candidate);
	}
	return kept;
}

/** 3. The object on white: the mask's bounding square (plus a margin) from the photo, outside the mask faded to white. */
function cutout(photo: Pixels, mask: Float32Array, box: Box): Uint8Array {
	const W = photo.width;
	const H = photo.height;
	const bw = (box[2] - box[0]) * W;
	const bh = (box[3] - box[1]) * H;
	const side = Math.max(bw, bh) * 1.08;
	const cx = ((box[0] + box[2]) / 2) * W;
	const cy = ((box[1] + box[3]) / 2) * H;
	const x0 = cx - side / 2;
	const y0 = cy - side / 2;
	const out = new Uint8Array(CUTOUT * CUTOUT * 3);
	const scale = side / CUTOUT;
	for (let y = 0; y < CUTOUT; y++) {
		const py = y0 + (y + 0.5) * scale;
		for (let x = 0; x < CUTOUT; x++) {
			const px = x0 + (x + 0.5) * scale;
			const o = (y * CUTOUT + x) * 3;
			if (px < 0 || py < 0 || px >= W || py >= H) {
				out[o] = out[o + 1] = out[o + 2] = 255;
				continue;
			}
			// The mask covers the photo stretched to a square, so photo fractions index it directly.
			const logit = maskAt(mask, px / W, py / H);
			const alpha = 1 / (1 + Math.exp(-logit * 2));
			for (let c = 0; c < 3; c++) out[o + c] = Math.round(sample(photo, px - 0.5, py - 0.5, c) * alpha + 255 * (1 - alpha));
		}
	}
	return encodePng(CUTOUT, CUTOUT, out, 3);
}

/** The mask's logit at photo fractions (fx, fy), bilinear between its 256 × 256 cells. */
export function maskAt(mask: Float32Array, fx: number, fy: number): number {
	const x = Math.min(MASK - 1, Math.max(0, fx * MASK - 0.5));
	const y = Math.min(MASK - 1, Math.max(0, fy * MASK - 0.5));
	const x0 = Math.floor(x);
	const y0 = Math.floor(y);
	const x1 = Math.min(MASK - 1, x0 + 1);
	const y1 = Math.min(MASK - 1, y0 + 1);
	const ax = x - x0;
	const ay = y - y0;
	const top = mask[y0 * MASK + x0] * (1 - ax) + mask[y0 * MASK + x1] * ax;
	const bottom = mask[y1 * MASK + x0] * (1 - ax) + mask[y1 * MASK + x1] * ax;
	return top * (1 - ay) + bottom * ay;
}

/** Find, mask and cut out the things in a photo (JPEG bytes, ideally about 1024 px on the long side). */
export async function analyzeScene(jpeg: Uint8Array, models: SceneModels, options: SceneOptions = {}): Promise<SceneObject[]> {
	const { threshold = 0.12, limit = 15, onStep } = options;
	onStep?.("Reading the photo…");
	const photo = decodeJpeg(jpeg);

	onStep?.("Looking for furniture and things…");
	const found = await detect(models, photo, threshold, limit);
	if (!found.length) return [];

	onStep?.("Outlining them…");
	const features = await models.run(
		"encoder",
		{ pixel_values: { dims: [1, 3, EDGETAM_SIZE, EDGETAM_SIZE], data: toTensor(photo, EDGETAM_SIZE, IMAGENET_MEAN, IMAGENET_STD) } },
		["feats0", "feats1", "feats2"],
	);
	// A photo on its own has no video memory: EdgeTAM adds its learned "no memory" vector to the coarsest features.
	const feats2 = new Float32Array(features.feats2.data);
	const cells = feats2.length / EDGETAM_NO_MEMORY.length;
	for (let c = 0; c < EDGETAM_NO_MEMORY.length; c++) {
		for (let i = 0; i < cells; i++) feats2[c * cells + i] += EDGETAM_NO_MEMORY[c];
	}

	const objects: SceneObject[] = [];
	for (const { box, score, label } of found) {
		// A box is two prompt points: top-left labelled 2, bottom-right labelled 3.
		const out = await models.run(
			"decoder",
			{
				feats0: features.feats0,
				feats1: features.feats1,
				feats2: { dims: features.feats2.dims, data: feats2 },
				input_points: { dims: [1, 1, 2, 2], data: Float32Array.from([box[0], box[1], box[2], box[3]].map((v) => v * EDGETAM_SIZE)) },
				input_labels: { dims: [1, 1, 2], data: Float32Array.from([2, 3]) },
			},
			["pred_masks", "object_score_logits"],
		);
		if (out.object_score_logits.data[0] <= 0) continue;
		const mask = Float32Array.from(out.pred_masks.data.subarray(0, MASK * MASK));
		let count = 0;
		let sx = 0;
		let sy = 0;
		let minX = MASK;
		let minY = MASK;
		let maxX = -1;
		let maxY = -1;
		for (let y = 0; y < MASK; y++) {
			for (let x = 0; x < MASK; x++) {
				if (mask[y * MASK + x] <= 0) continue;
				count++;
				sx += x;
				sy += y;
				if (x < minX) minX = x;
				if (x > maxX) maxX = x;
				if (y < minY) minY = y;
				if (y > maxY) maxY = y;
			}
		}
		const area = count / (MASK * MASK);
		if (area < 0.002) continue;
		// A long thin sliver (the edge of a desk, a strip of shelf) is a part of something, and it matches LED strips.
		const width = ((maxX - minX + 1) / MASK) * photo.width;
		const height = ((maxY - minY + 1) / MASK) * photo.height;
		if (Math.max(width / height, height / width) > 4) continue;
		// The same thing found twice (a chair and an "office chair" box around it): keep the first, more confident one.
		if (objects.some((o) => maskIou(o.mask, mask) > 0.6)) continue;
		const tight: Box = [minX / MASK, minY / MASK, (maxX + 1) / MASK, (maxY + 1) / MASK];
		objects.push({
			label,
			detectorScore: score,
			box: tight,
			centre: [(sx / count + 0.5) / MASK, (sy / count + 0.5) / MASK],
			area,
			cutout: new Uint8Array(0),
			mask,
		});
	}

	onStep?.("Cutting them out…");
	for (const object of objects) object.cutout = cutout(photo, object.mask, object.box);
	return objects;
}

/** The objects' masks over the photo in colour, `width` px wide with the photo's proportions, as an RGBA PNG. */
export function overlayPng(objects: { mask: Float32Array }[], aspect: number, width = 480): Uint8Array {
	const height = Math.round(width / aspect);
	const out = new Uint8Array(width * height * 4);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const fx = (x + 0.5) / width;
			const fy = (y + 0.5) / height;
			for (let i = 0; i < objects.length; i++) {
				if (maskAt(objects[i].mask, fx, fy) <= 0) continue;
				const [r, g, b] = OVERLAY_COLORS[i % OVERLAY_COLORS.length];
				const o = (y * width + x) * 4;
				out[o] = r;
				out[o + 1] = g;
				out[o + 2] = b;
				out[o + 3] = 120;
				break;
			}
		}
	}
	return encodePng(width, height, out, 4);
}

/** Which object (index) is at photo fractions (fx, fy), or -1. Smaller objects win where masks overlap. */
export function objectAt(objects: { mask: Float32Array; area: number }[], fx: number, fy: number): number {
	let hit = -1;
	for (let i = 0; i < objects.length; i++) {
		if (maskAt(objects[i].mask, fx, fy) > 0 && (hit < 0 || objects[i].area < objects[hit].area)) hit = i;
	}
	return hit;
}

export const OVERLAY_COLORS: [number, number, number][] = [
	[230, 25, 75],
	[60, 180, 75],
	[255, 205, 0],
	[0, 130, 200],
	[245, 130, 48],
	[145, 30, 180],
	[70, 220, 220],
	[240, 50, 230],
	[170, 230, 50],
	[0, 128, 128],
	[220, 160, 255],
	[170, 110, 40],
];
