// Download the room scan's models into ./models, the same files the app downloads (app/src/scene/models.ts).
import { createWriteStream, existsSync, mkdirSync, renameSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const FILES = {
	"owlvit-base-patch32-quantized.onnx": "https://huggingface.co/Xenova/owlvit-base-patch32/resolve/main/onnx/model_quantized.onnx",
	"edgetam-vision-encoder.onnx": "https://huggingface.co/jax-image-tools/edgetam-video-onnx/resolve/main/vision_encoder.onnx",
	"edgetam-mask-decoder.onnx": "https://huggingface.co/jax-image-tools/edgetam-video-onnx/resolve/main/mask_decoder.onnx",
};

mkdirSync("models", { recursive: true });
for (const [name, url] of Object.entries(FILES)) {
	const target = `models/${name}`;
	if (existsSync(target)) continue;
	console.log(`Downloading ${name}…`);
	const response = await fetch(url);
	if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
	await pipeline(Readable.fromWeb(response.body), createWriteStream(`${target}.part`));
	renameSync(`${target}.part`, target);
}
console.log("Models ready.");
