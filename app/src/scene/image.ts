import { decode } from "jpeg-js";

/** 8-bit RGBA pixels, row by row. */
export interface Pixels {
	width: number;
	height: number;
	data: Uint8Array;
}

/** A JPEG file's pixels. jpeg-js is plain JavaScript, so this runs on Hermes as it does in Node. */
export function decodeJpeg(bytes: Uint8Array): Pixels {
	const image = decode(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 256 });
	return { width: image.width, height: image.height, data: image.data as Uint8Array };
}

/** Bilinear sample of channel `c` at (x, y) in pixel coordinates, clamped to the edges. */
export function sample(image: Pixels, x: number, y: number, c: number): number {
	const { width, height, data } = image;
	const fx = Math.min(width - 1, Math.max(0, x));
	const fy = Math.min(height - 1, Math.max(0, y));
	const x0 = Math.floor(fx);
	const y0 = Math.floor(fy);
	const x1 = Math.min(width - 1, x0 + 1);
	const y1 = Math.min(height - 1, y0 + 1);
	const ax = fx - x0;
	const ay = fy - y0;
	const top = data[(y0 * width + x0) * 4 + c] * (1 - ax) + data[(y0 * width + x1) * 4 + c] * ax;
	const bottom = data[(y1 * width + x0) * 4 + c] * (1 - ax) + data[(y1 * width + x1) * 4 + c] * ax;
	return top * (1 - ay) + bottom * ay;
}

/**
 * The picture squeezed to `size` × `size` as a 1 × 3 × size × size float tensor, normalised with `mean` and `std`
 * (the models stretch the photo rather than pad it).
 */
export function toTensor(image: Pixels, size: number, mean: readonly number[], std: readonly number[]): Float32Array {
	const out = new Float32Array(3 * size * size);
	const sx = image.width / size;
	const sy = image.height / size;
	for (let y = 0; y < size; y++) {
		const py = (y + 0.5) * sy - 0.5;
		for (let x = 0; x < size; x++) {
			const px = (x + 0.5) * sx - 0.5;
			const i = y * size + x;
			for (let c = 0; c < 3; c++) out[c * size * size + i] = (sample(image, px, py, c) / 255 - mean[c]) / std[c];
		}
	}
	return out;
}

// PNG without compression: a zlib stream of stored blocks needs no deflate implementation, and LiteRT-LM, expo-image
// and every other PNG reader accept it. Files are larger (about width × height × channels) but are written once.

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c >>> 0;
	}
	return table;
})();

function crc32(bytes: Uint8Array, start: number, end: number): number {
	let c = 0xffffffff;
	for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

/** RGB (3 channels) or RGBA (4) pixels, row by row, as a PNG file. */
export function encodePng(width: number, height: number, pixels: Uint8Array, channels: 3 | 4): Uint8Array {
	const row = width * channels + 1;
	const raw = height * row;
	const blocks = Math.max(1, Math.ceil(raw / 65535));
	const zlibLength = 2 + raw + blocks * 5 + 4;
	const out = new Uint8Array(8 + (12 + 13) + (12 + zlibLength) + 12);
	const view = new DataView(out.buffer);
	out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
	let at = 8;
	const chunk = (type: string, length: number, write: () => void) => {
		view.setUint32(at, length);
		const start = at + 4;
		for (let i = 0; i < 4; i++) out[start + i] = type.charCodeAt(i);
		at = start + 4;
		write();
		view.setUint32(at, crc32(out, start, at));
		at += 4;
	};
	chunk("IHDR", 13, () => {
		view.setUint32(at, width);
		view.setUint32(at + 4, height);
		out.set([8, channels === 4 ? 6 : 2, 0, 0, 0], at + 8);
		at += 13;
	});
	chunk("IDAT", zlibLength, () => {
		out[at++] = 0x78;
		out[at++] = 0x01;
		let a = 1;
		let b = 0;
		let written = 0;
		for (let block = 0; block < blocks; block++) {
			const length = Math.min(65535, raw - written);
			out[at++] = block === blocks - 1 ? 1 : 0;
			view.setUint16(at, length, true);
			view.setUint16(at + 2, ~length & 0xffff, true);
			at += 4;
			for (let i = 0; i < length; i++, written++) {
				const y = Math.floor(written / row);
				const x = written - y * row;
				// Each row starts with filter type 0 (none).
				const value = x === 0 ? 0 : pixels[y * width * channels + x - 1];
				out[at++] = value;
				a = (a + value) % 65521;
				b = (b + a) % 65521;
			}
		}
		view.setUint32(at, ((b << 16) | a) >>> 0);
		at += 4;
	});
	chunk("IEND", 0, () => {});
	return out;
}
