import { Directory, File, Paths } from "expo-file-system";
import { GemmaEmbed } from "../modules/gemma-embed";

// EmbeddingGemma 2 Text Vision 440M (Google, Apache-2.0) as a LiteRT-LM bundle: the full model's text and picture
// encoders without the audio one, so photos and typed descriptions land in the same space as the index the PC built
// with google/embeddinggemma-2. The generic file runs on any phone's CPU or GPU; the per-chip NPU files are not used.
const MODEL_URL =
	"https://huggingface.co/litert-community/embeddinggemma-2-text-vision-440m-litert-lm/resolve/main/embeddinggemma-2-text-vision-440m.litertlm";
export const MODEL = { name: "embeddinggemma-2-text-vision-440m.litertlm", megabytes: 388 } as const;

function modelFile(): File {
	const directory = new Directory(Paths.document, "model");
	directory.create({ intermediates: true, idempotent: true });
	return new File(directory, MODEL.name);
}

export function modelPresent(): boolean {
	return modelFile().exists;
}

export async function downloadModel(onProgress: (fraction: number) => void, signal?: AbortSignal): Promise<void> {
	const destination = modelFile();
	if (destination.exists) return;
	// Download beside the final name so a half-finished file is never mistaken for the model.
	const partial = new File(destination.parentDirectory, `${MODEL.name}.part`);
	if (partial.exists) partial.delete();
	await File.downloadFileAsync(MODEL_URL, partial, {
		signal,
		onProgress: ({ bytesWritten, totalBytes }) => {
			if (totalBytes > 0) onProgress(bytesWritten / totalBytes);
		},
	});
	await partial.move(destination);
}

/** `visionTokens` must be the index's: the PC embedded every product picture at that many vision tokens. */
export function loadModel(visionTokens: number): Promise<{ backend: string; ms: number }> {
	return GemmaEmbed.load(modelFile().uri, true, visionTokens);
}

export const embedImage = (uri: string, dims: number) => GemmaEmbed.embedImage(uri, dims);
export const embedText = (text: string, dims: number) => GemmaEmbed.embedText(text, dims);
