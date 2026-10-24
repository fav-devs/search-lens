const { withAndroidManifest, withXcodeProject } = require("expo/config-plugins");

// LiteRT-LM needs two things the Expo modules can't declare themselves.
module.exports = function withLiteRT(config) {
	// Android: the GPU backend loads the phone's OpenCL driver, which apps targeting Android 12+ must ask for, or the
	// model quietly ends up on the CPU.
	config = withAndroidManifest(config, (config) => {
		const application = config.modResults.manifest.application?.[0];
		if (!application) throw new Error("Cannot add LiteRT-LM's GPU libraries: <application> missing.");
		const libraries = (application["uses-native-library"] ??= []);
		for (const name of ["libOpenCL.so", "libvndksupport.so"]) {
			if (!libraries.some((library) => library.$["android:name"] === name)) {
				libraries.push({ $: { "android:name": name, "android:required": "false" } });
			}
		}
		return config;
	});

	// iOS: React Native attaches the Swift package to the pod but doesn't embed its dynamic framework in the app.
	return withXcodeProject(config, (config) => {
		const project = config.modResults;
		const application = project.getTarget("com.apple.product-type.application");
		if (!application) throw new Error("Cannot embed LiteRT-LM: application target missing.");
		const name = "Embed LiteRT-LM Framework";
		if (!application.target.buildPhases.some((phase) => phase.comment === name)) {
			project.addBuildPhase([], "PBXShellScriptBuildPhase", name, application.uuid, {
				shellPath: "/bin/sh",
				shellScript: '/bin/sh "${SRCROOT}/../scripts/embed-litert-framework.sh"',
			});
		}
		const objects = project.hash.project.objects;
		const list = objects.XCConfigurationList[application.target.buildConfigurationList];
		for (const reference of list.buildConfigurations) {
			const settings = objects.XCBuildConfiguration[reference.value].buildSettings;
			const existing = settings.LD_RUNPATH_SEARCH_PATHS;
			const paths = Array.isArray(existing) ? [...existing] : existing ? [existing] : ['"$(inherited)"'];
			if (!paths.some((value) => value.includes("@executable_path/Frameworks"))) paths.push('"@executable_path/Frameworks"');
			settings.LD_RUNPATH_SEARCH_PATHS = paths;
			settings.ENABLE_USER_SCRIPT_SANDBOXING = "NO";
		}
		return config;
	});
};
