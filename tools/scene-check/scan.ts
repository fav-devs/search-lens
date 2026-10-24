// npm run scan -- photo.jpg [more.jpg …]: finds the things in each photo with the app's own room-scan code and writes
// out/<photo>/: N.png (each cutout, as the phone embeds it), overlay.png and objects.json. Match the cutouts against
// an index on the PC with `lens search out/<photo>/N.png`.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname } from "node:path";
import * as ort from "onnxruntime-node";
import { decodeJpeg } from "../../app/src/scene/image";
import { analyzeScene, overlayPng, type SceneModels, type Tensor } from "../../app/src/scene/scene";

// The phone's bridge converts integer inputs to the model's declared type; here it's done by name.
const INTEGER: Record<string, "int64" | "int32"> = { input_ids: "int64", attention_mask: "int64", input_labels: "int32" };

const sessions = {
	detector: await ort.InferenceSession.create("models/owlvit-base-patch32-quantized.onnx"),
	encoder: await ort.InferenceSession.create("models/edgetam-vision-encoder.onnx"),
	decoder: await ort.InferenceSession.create("models/edgetam-mask-decoder.onnx"),
};

const models: SceneModels = {
	async run(model, inputs, outputs) {
		const feeds: Record<string, ort.Tensor> = {};
		for (const [name, t] of Object.entries(inputs)) {
			const type = INTEGER[name];
			feeds[name] =
				type === "int64"
					? new ort.Tensor("int64", BigInt64Array.from(t.data, (v) => BigInt(Math.round(v))), t.dims)
					: type === "int32"
						? new ort.Tensor("int32", Int32Array.from(t.data, (v) => Math.round(v)), t.dims)
						: new ort.Tensor("float32", t.data, t.dims);
		}
		const result = await sessions[model].run(feeds, outputs);
		const out: Record<string, Tensor> = {};
		for (const name of outputs) out[name] = { dims: [...result[name].dims], data: result[name].data as Float32Array };
		return out;
	},
};

for (const path of process.argv.slice(2)) {
	const jpeg = new Uint8Array(readFileSync(path));
	const started = performance.now();
	const objects = await analyzeScene(jpeg, models);
	const folder = `out/${basename(path, extname(path))}`;
	mkdirSync(folder, { recursive: true });
	objects.forEach((o, i) => writeFileSync(`${folder}/${i + 1}.png`, o.cutout));
	const photo = decodeJpeg(jpeg);
	writeFileSync(`${folder}/overlay.png`, overlayPng(objects, photo.width / photo.height));
	writeFileSync(
		`${folder}/objects.json`,
		JSON.stringify(objects.map((o, i) => ({ n: i + 1, label: o.label, score: o.detectorScore, box: o.box, centre: o.centre, area: o.area })), null, 1),
	);
	console.log(`${path}: ${objects.length} things in ${((performance.now() - started) / 1000).toFixed(1)} s → ${folder}/`);
	objects.forEach((o, i) => console.log(`  ${i + 1}. ${o.label} (${o.detectorScore.toFixed(2)})`));
}
