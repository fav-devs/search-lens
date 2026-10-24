import Foundation
import LiteRTLM

// EmbeddingGemma 2 on iPhone through Google's LiteRT-LM: load the model once, then turn a photo or a line of text into
// a vector in the same space as the index the PC built. Kept apart from ExpoModulesCore so LiteRT-LM's names are the
// only ones in scope.

enum GemmaError: LocalizedError {
  case notLoaded
  case noEngine

  var errorDescription: String? {
    switch self {
    case .notLoaded: return "Load the model first"
    case .noEngine: return "Couldn't start the embedding engine"
    }
  }
}

actor GemmaEngine {
  static let shared = GemmaEngine()

  private var engine: EmbeddingEngine?
  private var engineKey = ""
  private var backendName = ""
  private var visionTokens = 140

  private func filePath(_ value: String) -> String {
    if value.hasPrefix("file://"), let url = URL(string: value) { return url.path }
    return value
  }

  /// Loads the model (a few seconds) unless it already is. Returns where it runs and how long loading took.
  func load(modelPath: String, gpu: Bool, tokens: Int) async throws -> [String: Any] {
    let path = filePath(modelPath)
    let key = "\(path)|\(gpu)|\(tokens)"
    if engine != nil, engineKey == key { return ["backend": backendName, "ms": 0.0] }
    await close()
    let start = Date()
    // The GPU delegate can refuse a graph ("Failed to modify graph with delegate"), the vision encoder's most often, so
    // that goes to the CPU first and everything goes to the CPU last.
    var attempts: [(name: String, main: Backend, vision: Backend)] = []
    if gpu {
      attempts.append(("GPU", .gpu, .gpu))
      attempts.append(("GPU + CPU vision", .gpu, .cpu()))
    }
    attempts.append(("CPU", .cpu(), .cpu()))
    var failure: Error?
    for attempt in attempts {
      let created = EmbeddingEngine(config: EmbeddingEngineConfig(
        modelPath: path,
        backend: attempt.main,
        visionBackend: attempt.vision,
        cacheDir: FileManager.default.temporaryDirectory.path,
        visionTokensPerImage: tokens
      ))
      do {
        try await created.initialize()
      } catch {
        await created.close()
        failure = error
        continue
      }
      engine = created
      engineKey = key
      backendName = attempt.name
      visionTokens = tokens
      return ["backend": attempt.name, "ms": Date().timeIntervalSince(start) * 1000]
    }
    throw failure ?? GemmaError.noEngine
  }

  func embedImage(path: String, outputSize: Int) async throws -> [Double] {
    try await embed(.imageFile(filePath(path)), options: EmbeddingOptions(
      normalize: true,
      outputSize: outputSize,
      visionTokensPerImage: visionTokens
    ))
  }

  func embedText(_ text: String, outputSize: Int) async throws -> [Double] {
    try await embed(.text(text), options: EmbeddingOptions(normalize: true, outputSize: outputSize))
  }

  private func embed(_ content: Content, options: EmbeddingOptions) async throws -> [Double] {
    guard let engine else { throw GemmaError.notLoaded }
    let response = try await engine.computeEmbedding(contents: [content], options: options)
    return response.embedding.map { Double($0) }
  }

  func close() async {
    if let engine { await engine.close() }
    engine = nil
    engineKey = ""
  }
}
