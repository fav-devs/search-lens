import ExpoModulesCore

public class GemmaEmbedModule: Module {
  private let onnxQueue = DispatchQueue(label: "searchlens.onnx", qos: .userInitiated)

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

    // Any ONNX model from JS (LensOnnx.mm): float32 values packed into one ArrayBuffer each way. On a queue of their
    // own: a run can take seconds, and Expo's shared queue would hold up every other module's calls meanwhile.
    AsyncFunction("onnxCreateSession") { (modelPath: String, threads: Int, coreML: Bool) throws -> [String: Any] in
      try LensOnnxRunner.createSession(withPath: modelPath, threads: threads, useCoreML: coreML)
    }.runOnQueue(onnxQueue)

    AsyncFunction("onnxRun") {
      (sessionId: Int, inputs: [[String: Any]], data: ArrayBuffer, outputNames: [String]) throws -> ArrayBuffer in
      let names = inputs.map { $0["name"] as? String ?? "" }
      let dims = inputs.map { input in ((input["dims"] as? [Any]) ?? []).map { NSNumber(value: ($0 as? NSNumber)?.int64Value ?? -1) } }
      let result = try data.withUnsafeBytes { bytes in
        try LensOnnxRunner.runSession(
          sessionId, inputNames: names, dims: dims, bytes: bytes.baseAddress, length: UInt(bytes.count), outputNames: outputNames)
      }
      let packed = ArrayBuffer(size: Int(result.length), initializeToZero: false)
      packed.withUnsafeMutableBytes { result.write(to: $0.baseAddress!) }
      return packed
    }.runOnQueue(onnxQueue)

    Function("onnxRelease") { (sessionId: Int) -> Void in
      LensOnnxRunner.releaseSession(sessionId)
    }
  }
}
