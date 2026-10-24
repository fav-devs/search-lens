package lens.gemma

import ai.onnxruntime.OnnxJavaType
import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import ai.onnxruntime.TensorInfo
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import java.nio.IntBuffer
import java.nio.LongBuffer
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

// ONNX Runtime sessions for JS (onnxCreateSession / onnxRun / onnxRelease), from the Sondr app's OnnxRunner.kt. Values
// travel as float32 both ways; an input the model declares as int32 or int64 (token ids, prompt labels) is converted
// here. The same API as ios/LensOnnxCore.hpp.

class OnnxTensorInfo(val name: String, val dims: List<Long>, val type: String) {
  fun toMap(): Map<String, Any> = mapOf("name" to name, "dims" to dims.map { it.toDouble() }, "type" to type)
}

/** One float32 output: its shape and values. */
class OnnxOutput(val name: String, val dims: LongArray, val data: FloatArray)

class OnnxModel(path: String, threads: Int) : AutoCloseable {
  private val environment = OrtEnvironment.getEnvironment()
  private val options = OrtSession.SessionOptions().apply {
    if (threads > 0) setIntraOpNumThreads(threads)
    setInterOpNumThreads(1)
    setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT)
  }
  private val session: OrtSession

  init {
    require(java.io.File(path).exists()) { "The model file isn't there: $path" }
    session = environment.createSession(path, options)
  }

  val inputs: List<OnnxTensorInfo> = session.inputInfo.values.map { describe(it.name, it.info) }
  val outputs: List<OnnxTensorInfo> = session.outputInfo.values.map { describe(it.name, it.info) }
  private val inputTypes = inputs.associate { it.name to it.type }

  /** Run once. Outputs come back in the order of `outputNames` (all of the model's when empty). */
  fun run(inputs: List<Triple<String, LongArray, FloatBuffer>>, outputNames: List<String>): List<OnnxOutput> {
    val names = outputNames.ifEmpty { outputs.map { it.name } }
    val tensors = inputs.associate { (name, dims, data) -> name to tensor(name, dims, data) }
    try {
      session.run(tensors, names.toSet()).use { result ->
        return names.map { name ->
          val tensor = result.get(name).orElseThrow { IllegalStateException("The model gave no $name") } as OnnxTensor
          val info = tensor.info
          require(info.type == OnnxJavaType.FLOAT) { "Output $name isn't float32" }
          val buffer = tensor.floatBuffer
          val values = FloatArray(buffer.remaining())
          buffer.get(values)
          OnnxOutput(name, info.shape, values)
        }
      }
    } finally {
      tensors.values.forEach { it.close() }
    }
  }

  private fun tensor(name: String, dims: LongArray, data: FloatBuffer): OnnxTensor {
    val values = FloatArray(data.remaining())
    data.duplicate().get(values)
    return when (inputTypes[name]) {
      "int64" -> OnnxTensor.createTensor(environment, LongBuffer.wrap(LongArray(values.size) { Math.round(values[it].toDouble()) }), dims)
      "int32" -> OnnxTensor.createTensor(environment, IntBuffer.wrap(IntArray(values.size) { Math.round(values[it]) }), dims)
      else -> OnnxTensor.createTensor(environment, FloatBuffer.wrap(values), dims)
    }
  }

  override fun close() {
    session.close()
    options.close()
  }

  private fun describe(name: String, info: ai.onnxruntime.ValueInfo?): OnnxTensorInfo {
    val tensor = info as? TensorInfo ?: return OnnxTensorInfo(name, emptyList(), "other")
    val type = when (tensor.type) {
      OnnxJavaType.FLOAT -> "float32"
      OnnxJavaType.FLOAT16 -> "float16"
      OnnxJavaType.DOUBLE -> "float64"
      OnnxJavaType.INT64 -> "int64"
      OnnxJavaType.INT32 -> "int32"
      OnnxJavaType.UINT8 -> "uint8"
      OnnxJavaType.BOOL -> "bool"
      else -> "other"
    }
    return OnnxTensorInfo(name, tensor.shape.toList(), type)
  }
}

private fun count(dims: LongArray): Int {
  var total = 1L
  for (d in dims) {
    require(d >= 0) { "A tensor shape can't have open sizes when it runs" }
    total *= d
  }
  return total.toInt()
}

/** The sessions JS holds, by id. */
object OnnxSessions {
  private val sessions = ConcurrentHashMap<Int, OnnxModel>()
  private val nextId = AtomicInteger(1)

  fun create(path: String, threads: Int): Map<String, Any> {
    val model = OnnxModel(path, threads)
    val id = nextId.getAndIncrement()
    sessions[id] = model
    return mapOf("id" to id, "inputs" to model.inputs.map { it.toMap() }, "outputs" to model.outputs.map { it.toMap() })
  }

  fun get(id: Int): OnnxModel = sessions[id] ?: throw IllegalArgumentException("No ONNX session $id (it was released)")

  fun release(id: Int) {
    sessions.remove(id)?.close()
  }

  /** `data` holds each input's float32 values back to back, in order. */
  fun run(id: Int, names: List<String>, dims: List<LongArray>, data: ByteBuffer, outputNames: List<String>): ByteBuffer {
    require(names.size == dims.size) { "Each input needs a name and a shape" }
    val floats = data.order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer()
    var offset = 0
    val inputs = names.mapIndexed { i, name ->
      val size = count(dims[i])
      require(offset + size <= floats.limit()) { "The input data is shorter than the shapes say" }
      floats.position(offset)
      val slice = floats.slice()
      slice.limit(size)
      offset += size
      Triple(name, dims[i], slice)
    }
    require(offset == floats.limit()) { "The input data is longer than the shapes say" }
    return pack(get(id).run(inputs, outputNames))
  }

  /**
   * Outputs for JS, in one direct buffer: int32 count, then per output its rank and sizes (int32s), then every
   * output's float32 values back to back in the same order. Read by `runOnnx` in modules/gemma-embed/index.ts.
   */
  private fun pack(outputs: List<OnnxOutput>): ByteBuffer {
    val header = 1 + outputs.sumOf { 1 + it.dims.size }
    val floats = outputs.sumOf { it.data.size }
    val buffer = ByteBuffer.allocateDirect((header + floats) * 4).order(ByteOrder.LITTLE_ENDIAN)
    buffer.putInt(outputs.size)
    for (output in outputs) {
      buffer.putInt(output.dims.size)
      for (d in output.dims) buffer.putInt(d.toInt())
    }
    for (output in outputs) for (value in output.data) buffer.putFloat(value)
    buffer.rewind()
    return buffer
  }
}
