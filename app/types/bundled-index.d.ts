// See metro.config.js: an asset module id when the app was built with assets/searchlens.pack, null otherwise.
declare module "searchlens-bundled-index" {
	const bundled: number | null;
	export = bundled;
}
