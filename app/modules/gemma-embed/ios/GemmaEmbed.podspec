Pod::Spec.new do |s|
  s.name           = 'GemmaEmbed'
  s.version        = '0.1.0'
  s.summary        = 'EmbeddingGemma 2 on LiteRT-LM: one photo or one line of text to a vector.'
  s.description    = s.summary
  s.license        = 'MIT'
  s.author         = 'Search Lens'
  s.homepage       = 'https://github.com/fav-devs/search-lens'
  s.platforms      = { :ios => '17.0' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.source_files = "**/*.{h,mm,swift}"
  # Plain C++ included by LensOnnx.mm, never a public header (Swift sees only LensOnnx.h).
  s.preserve_paths = "**/*.hpp"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule',
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17'
  }

  # ONNX Runtime for the room scan (LensOnnx.mm): OWL-ViT and EdgeTAM. `onnxruntime-c` (the C/C++ API as a vendored
  # framework) rather than `onnxruntime-objc`: CocoaPods refuses a Swift pod that depends on an Objective-C pod
  # without a module map. Keep in step with onnxruntime-android in android/build.gradle.
  s.dependency 'onnxruntime-c', '1.24.3'

  # Google's LiteRT-LM Swift package (a binary xcframework), through React Native's `spm_dependency`. Keep in step with
  # the Android library in android/build.gradle. The app's config plugin embeds its framework (plugins/with-litert.js).
  spm_dependency(
    s,
    url: 'https://github.com/google-ai-edge/LiteRT-LM',
    requirement: { kind: 'exactVersion', version: '0.18.1' },
    products: %w[LiteRTLM]
  )
end
