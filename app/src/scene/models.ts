import { Directory, File, Paths } from "expo-file-system";
import { createOnnxSession, GemmaEmbed, runOnnx } from "../../modules/gemma-embed";
import type { SceneModels } from "./scene";

// The room scan's two models, downloaded the first time it is used (about 190 MB) and run through ONNX Runtime in
// modules/gemma-embed. Both Apache-2.0.
export const SCENE_FILES = [
	{
		model: "detector",
		name: "owlvit-base-patch32-quantized.onnx",
		url: "https://huggingface.co/Xenova/owlvit-base-patch32/resolve/main/onnx/model_quantized.onnx",
		megabytes: 155,
	},
	{
		model: "encoder",
		name: "edgetam-vision-encoder.onnx",
		url: "https://huggingface.co/jax-image-tools/edgetam-video-onnx/resolve/main/vision_encoder.onnx",
		megabytes: 20,
	},
	{
		model: "decoder",
		name: "edgetam-mask-decoder.onnx",
		url: "https://huggingface.co/jax-image-tools/edgetam-video-onnx/resolve/main/mask_decoder.onnx",
		megabytes: 18,
	},
] as const;

export const SCENE_MEGABYTES = SCENE_FILES.reduce((sum, f) => sum + f.megabytes, 0);

function directory(): Directory {
	const folder = new Directory(Paths.document, "scene-models");
	folder.create({ intermediates: true, idempotent: true });
	return folder;
}

export function sceneModelsPresent(): boolean {
	return SCENE_FILES.every((f) => new File(directory(), f.name).exists);
}

/** Download whatever isn't on the phone yet. `onProgress` gets 0–1 over all three files. */
export async function downloadSceneModels(onProgress: (fraction: number) => void): Promise<void> {
	let before = 0;
	for (const f of SCENE_FILES) {
		const destination = new File(directory(), f.name);
		if (!destination.exists) {
			// Beside the final name, so a half-finished file is never taken for a model.
			const partial = new File(directory(), `${f.name}.part`);
			if (partial.exists) partial.delete();
			await File.downloadFileAsync(f.url, partial, {
				onProgress: ({ bytesWritten, totalBytes }) => {
					if (totalBytes > 0) onProgress((before + (bytesWritten / totalBytes) * f.megabytes) / SCENE_MEGABYTES);
				},
			});
			await partial.move(destination);
		}
		before += f.megabytes;
		onProgress(before / SCENE_MEGABYTES);
	}
}

/** Load the three models (a few seconds). Call `release` when the scan is done: together they hold about 400 MB. */
export async function loadSceneModels(): Promise<SceneModels & { release(): void }> {
	const sessions: Record<string, number> = {};
	try {
		for (const f of SCENE_FILES) sessions[f.model] = (await createOnnxSession(new File(directory(), f.name).uri)).id;
	} catch (error) {
		for (const id of Object.values(sessions)) GemmaEmbed.onnxRelease(id);
		throw error;
	}
	return {
		run: (model, inputs, outputs) => runOnnx(sessions[model], inputs, outputs),
		release: () => {
			for (const id of Object.values(sessions)) GemmaEmbed.onnxRelease(id);
		},
	};
}
