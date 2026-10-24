import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

// SwiftPM checks LiteRT-LM out from a local mirror without its LFS objects. Its Swift targets use release-asset
// xcframeworks, not the prebuilt/ LFS files, so skip those for that checkout only.
if (process.env.EAS_BUILD_PLATFORM === "ios") {
	const directory = path.join(homedir(), ".config", "search-lens");
	mkdirSync(directory, { recursive: true });
	const config = path.join(directory, "litert-lfs.gitconfig");
	writeFileSync(config, "[lfs]\n\tfetchexclude = prebuilt/**\n");
	execFileSync("git", ["config", "--global", "--replace-all", "includeIf.gitdir:**/LiteRT-LM/**.path", config], { stdio: "inherit" });
	console.log("Configured the LiteRT-LM SwiftPM checkout to skip unused prebuilt/ LFS binaries.");
}
