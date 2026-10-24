import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

/**
 * The part of a photo that was inside the on-screen square guide, as a 448 px JPEG: the product, centred, the way the
 * catalogue shots are. The camera preview fills its view like `cover`, so the guide maps to a centred square of the
 * photo whose side is the guide's size divided by the preview's scale.
 */
export async function cropToGuide(uri: string, view: { width: number; height: number }, guide: number): Promise<string> {
	// Rendered once first so width and height are the upright photo's, whatever orientation it was taken in.
	const photo = await ImageManipulator.manipulate(uri).renderAsync();
	const { width, height } = photo;
	const scale = Math.max(view.width / width, view.height / height);
	const side = Math.floor(Math.min(width, height, guide / scale));
	const cropped = await ImageManipulator.manipulate(photo)
		.crop({ originX: Math.floor((width - side) / 2), originY: Math.floor((height - side) / 2), width: side, height: side })
		.resize({ width: 448, height: 448 })
		.renderAsync();
	const saved = await cropped.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
	photo.release();
	cropped.release();
	return saved.uri;
}
