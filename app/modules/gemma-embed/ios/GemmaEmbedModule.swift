import ExpoModulesCore

public class GemmaEmbedModule: Module {
  public func definition() -> ModuleDefinition {
    Name("GemmaEmbed")

    AsyncFunction("load") { (modelPath: String, gpu: Bool, tokens: Int) async throws -> [String: Any] in
      try await GemmaEngine.shared.load(modelPath: modelPath, gpu: gpu, tokens: tokens)
    }

    AsyncFunction("embedImage") { (imagePath: String, outputSize: Int) async throws -> [Double] in
      try await GemmaEngine.shared.embedImage(path: imagePath, outputSize: outputSize)
    }

    AsyncFunction("embedText") { (text: String, outputSize: Int) async throws -> [Double] in
      try await GemmaEngine.shared.embedText(text, outputSize: outputSize)
    }

    AsyncFunction("close") { () async in
      await GemmaEngine.shared.close()
    }
  }
}
