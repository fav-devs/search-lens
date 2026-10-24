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

    // Any ONNX model from JS (LensOnnx.mm): float32 values packed into one ArrayBuffer each way.
    AsyncFunction("onnxCreateSession") { (modelPath: String, threads: Int, coreML: Bool) throws -> [String: Any] in
      try LensOnnxRunner.createSession(withPath: modelPath, threads: threads, useCoreML: coreML)
    }

    AsyncFunction("onnxRun") {
      (sessionId: Int, inputs: [[String: Any]], data: ArrayBuffer, outputNames: [String]) throws -> ArrayBuffer in
      let names = inputs.map { $0["name"] as? String ?? "" }
      let dims = inputs.map { input in ((input["dims"] as? [Any]) ?? []).map { NSNumber(value: ($0 as? NSNumber)?.int64Value ?? -1) } }
      let packed = try LensOnnxRunner.runSession(sessionId, inputNames: names, dims: dims, data: data.data, outputNames: outputNames)
      return try ArrayBuffer.copy(data: packed)
    }

    Function("onnxRelease") { (sessionId: Int) -> Void in
      LensOnnxRunner.releaseSession(sessionId)
    }
  }
}
