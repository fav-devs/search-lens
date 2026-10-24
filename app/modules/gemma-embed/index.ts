import { requireNativeModule } from "expo";

/** EmbeddingGemma 2 on LiteRT-LM (android/…/GemmaEmbedModule.kt, ios/GemmaEngine.swift), and ONNX Runtime for the room scan. */
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
	/** Load an ONNX model. Use it through `createOnnxSession` / `runOnnx` below. */
	onnxCreateSession(modelPath: string, threads: number, coreML: boolean): Promise<OnnxSessionInfo>;
	/** Run once: each input's float32 values back to back in `data`; outputs packed the same way (see `runOnnx`). */
	onnxRun(sessionId: number, inputs: Array<{ name: string; dims: number[] }>, data: ArrayBuffer, outputNames: string[]): Promise<ArrayBuffer>;
	onnxRelease(sessionId: number): void;
}

export const GemmaEmbed = requireNativeModule<GemmaEmbedModule>("GemmaEmbed");

export interface OnnxSessionInfo {
	id: number;
	inputs: Array<{ name: string; dims: number[]; type: string }>;
	outputs: Array<{ name: string; dims: number[]; type: string }>;
}

/** A tensor for `runOnnx`: its shape and its values, row-major. Integer inputs are sent as floats and converted. */
export interface OnnxTensor {
	dims: number[];
	data: Float32Array;
}

/** Load an ONNX model (ONNX Runtime 1.24.3). `coreML` lets an iPhone put what it can on Core ML. */
export function createOnnxSession(modelPath: string, { threads = 0, coreML = false } = {}): Promise<OnnxSessionInfo> {
	return GemmaEmbed.onnxCreateSession(modelPath, threads, coreML);
}

/**
 * Run a session once: `inputs` by name in, the `outputs` named out. The values travel as one ArrayBuffer each way,
 * not as JSON numbers; the outputs are views into the buffer that came back.
 */
export async function runOnnx(sessionId: number, inputs: Record<string, OnnxTensor>, outputs: string[]): Promise<Record<string, OnnxTensor>> {
	const entries = Object.entries(inputs);
	const packed = new Float32Array(entries.reduce((sum, [, tensor]) => sum + tensor.data.length, 0));
	let offset = 0;
	for (const [, tensor] of entries) {
		packed.set(tensor.data, offset);
		offset += tensor.data.length;
	}
	const result = await GemmaEmbed.onnxRun(
		sessionId,
		entries.map(([name, tensor]) => ({ name, dims: tensor.dims })),
		packed.buffer,
		outputs,
	);
	// int32 count, then each output's rank and sizes, then the float32 values back to back.
	const ints = new Int32Array(result, 0, Math.floor(result.byteLength / 4));
	const count = ints[0];
	const shapes: number[][] = [];
	let at = 1;
	for (let i = 0; i < count; i++) {
		const rank = ints[at++];
		shapes.push(Array.from(ints.subarray(at, at + rank)));
		at += rank;
	}
	const decoded: Record<string, OnnxTensor> = {};
	let byte = at * 4;
	shapes.forEach((dims, i) => {
		const length = dims.reduce((product, size) => product * size, 1);
		decoded[outputs[i] ?? `output${i}`] = { dims, data: new Float32Array(result, byte, length) };
		byte += length * 4;
	});
	return decoded;
}
