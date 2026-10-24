package lens.gemma

import android.net.Uri
import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.EmbeddingEngine
import com.google.ai.edge.litertlm.EmbeddingEngineConfig
import com.google.ai.edge.litertlm.EmbeddingOptions
import com.google.ai.edge.litertlm.InputData
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

// EmbeddingGemma 2 on Android through Google's LiteRT-LM: load the model once, then turn a photo or a line of text
// into a vector in the same space as the index the PC built.
class GemmaEmbedModule : Module() {
  private class Attempt(val name: String, val main: Backend, val vision: Backend)

  private val lock = Any()
  private var engine: EmbeddingEngine? = null
  private var engineKey = ""
  private var backendName = ""
  private var visionTokens = 140

  private fun path(value: String): String = if (value.startsWith("file://")) Uri.parse(value).path ?: value else value

  override fun definition() = ModuleDefinition {
    Name("GemmaEmbed")

    AsyncFunction("load") { modelPath: String, gpu: Boolean, tokens: Int ->
      val context = appContext.reactContext ?: throw IllegalStateException("No Android context")
      load(context.cacheDir.absolutePath, path(modelPath), gpu, tokens)
    }

    AsyncFunction("embedImage") { imagePath: String, outputSize: Int ->
      embed(InputData.Image(File(path(imagePath)).readBytes()), outputSize, image = true)
    }

    AsyncFunction("embedText") { text: String, outputSize: Int ->
      embed(InputData.Text(text), outputSize, image = false)
    }

    AsyncFunction("close") { close() }

    OnDestroy { close() }
  }

  /** Loads the model (a few seconds) unless it already is. Returns where it runs and how long loading took. */
  private fun load(cacheDir: String, modelPath: String, gpu: Boolean, tokens: Int): Map<String, Any> {
    synchronized(lock) {
      val key = "$modelPath|$gpu|$tokens"
      if (engine != null && engineKey == key) return mapOf("backend" to backendName, "ms" to 0.0)
      close()
      val start = System.nanoTime()
      // The GPU delegate can refuse a graph ("Failed to modify graph with delegate"), the vision encoder's most often, so
      // that goes to the CPU first and everything goes to the CPU last.
      val attempts = buildList {
        if (gpu) {
          add(Attempt("GPU", Backend.GPU(), Backend.GPU()))
          add(Attempt("GPU + CPU vision", Backend.GPU(), Backend.CPU()))
        }
        add(Attempt("CPU", Backend.CPU(), Backend.CPU()))
      }
      var failure: Throwable? = null
      for (attempt in attempts) {
        val created = EmbeddingEngine(
          EmbeddingEngineConfig(
            modelPath = modelPath,
            backend = attempt.main,
            visionBackend = attempt.vision,
            cacheDir = cacheDir,
            visionTokensPerImage = tokens,
          ),
        )
        try {
          created.initialize()
        } catch (error: Throwable) {
          created.close()
          failure = error
          continue
        }
        engine = created
        engineKey = key
        backendName = attempt.name
        visionTokens = tokens
        return mapOf("backend" to attempt.name, "ms" to (System.nanoTime() - start) / 1e6)
      }
      throw failure ?: IllegalStateException("Couldn't start the embedding engine")
    }
  }

  private fun embed(input: InputData, outputSize: Int, image: Boolean): List<Double> {
    val current = synchronized(lock) { engine } ?: throw IllegalStateException("Load the model first")
    val options = EmbeddingOptions(
      normalize = true,
      outputSize = outputSize,
      visionTokensPerImage = if (image) visionTokens else null,
    )
    return current.computeEmbedding(listOf(input), options).embedding.map { it.toDouble() }
  }

  private fun close() = synchronized(lock) {
    engine?.close()
    engine = null
    engineKey = ""
  }
}
