import { requireNativeModule } from "expo";

/** EmbeddingGemma 2 on LiteRT-LM (android/…/GemmaEmbedModule.kt, ios/GemmaEngine.swift). */
export interface GemmaEmbedModule {
	/**
	 * Load the model (a few seconds; nothing if it already is). Tries the GPU, then the GPU with the vision encoder on the
	 * CPU, then the CPU, and says which one stuck.
	 */
	load(modelPath: string, gpu: boolean, visionTokens: number): Promise<{ backend: string; ms: number }>;
	/** A photo (JPEG or PNG file) as a unit-length vector of `outputSize` numbers: 128, 256, 512 or 768. */
	embedImage(path: string, outputSize: number): Promise<number[]>;
	/** Text as a unit-length vector. Put the task prefix on it first. */
	embedText(text: string, outputSize: number): Promise<number[]>;
	close(): Promise<void>;
}

export const GemmaEmbed = requireNativeModule<GemmaEmbedModule>("GemmaEmbed");
