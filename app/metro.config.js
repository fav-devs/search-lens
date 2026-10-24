const fs = require("node:fs");
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// The index built into the app (`lens bundle` on the PC writes assets/searchlens.pack). `searchlens-bundled-index`
// resolves to that file as an asset when it's there, and to a module exporting null when it isn't, so the app builds
// either way.
config.resolver.assetExts.push("pack");
const pack = path.join(__dirname, "assets", "searchlens.pack");
const none = path.join(__dirname, "src", "no-bundled-index.js");
const resolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
	if (moduleName === "searchlens-bundled-index") {
		return fs.existsSync(pack) ? { type: "assetFiles", filePaths: [pack] } : { type: "sourceFile", filePath: none };
	}
	return (resolve ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
