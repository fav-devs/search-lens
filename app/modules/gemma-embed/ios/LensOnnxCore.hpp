// ONNX Runtime sessions for JS (onnxCreateSession / onnxRun / onnxRelease), in plain C++ over the ONNX Runtime C++
// API so it can also be built and checked off the phone. From the Sondr app's SondrOnnxCore.hpp. Values travel as
// float32 both ways; an input the model declares as int32 or int64 (token ids, prompt labels) is converted here.
// Included only by LensOnnx.mm.
#pragma once

#include <cmath>
#include <cstdint>
#include <cstring>
#include <map>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <string>
#include <vector>

#if __has_include(<onnxruntime-c/onnxruntime_cxx_api.h>)
#include <onnxruntime-c/onnxruntime_cxx_api.h>
#elif __has_include("onnxruntime_cxx_api.h")
#include "onnxruntime_cxx_api.h"
#else
#error "The onnxruntime-c headers were not found"
#endif

namespace lens_onnx {

struct TensorInfo {
  std::string name;
  /// -1 where the model leaves a size open.
  std::vector<int64_t> dims;
  /// "float32", "int64", …
  std::string type;
};

/// A tensor going in, as float32 values: its shape and where its values are (not owned).
struct InputView {
  std::string name;
  std::vector<int64_t> dims;
  const float *data;
  size_t count;
};

struct Output {
  std::string name;
  std::vector<int64_t> dims;
  std::vector<float> data;
};

inline Ort::Env &sharedEnv() {
  static Ort::Env env(ORT_LOGGING_LEVEL_WARNING, "SearchLens");
  return env;
}

inline const char *typeName(ONNXTensorElementDataType type) {
  switch (type) {
    case ONNX_TENSOR_ELEMENT_DATA_TYPE_FLOAT: return "float32";
    case ONNX_TENSOR_ELEMENT_DATA_TYPE_FLOAT16: return "float16";
    case ONNX_TENSOR_ELEMENT_DATA_TYPE_DOUBLE: return "float64";
    case ONNX_TENSOR_ELEMENT_DATA_TYPE_INT64: return "int64";
    case ONNX_TENSOR_ELEMENT_DATA_TYPE_INT32: return "int32";
    case ONNX_TENSOR_ELEMENT_DATA_TYPE_UINT8: return "uint8";
    case ONNX_TENSOR_ELEMENT_DATA_TYPE_BOOL: return "bool";
    default: return "other";
  }
}

inline size_t elementCount(const std::vector<int64_t> &dims) {
  size_t count = 1;
  for (int64_t d : dims) {
    if (d < 0) throw std::runtime_error("A tensor shape can't have open sizes when it runs");
    count *= (size_t)d;
  }
  return count;
}

class Session {
 public:
  /// `threads` 0 lets ONNX Runtime choose. `options` may already carry an execution provider (Core ML).
  Session(const std::string &path, int threads, Ort::SessionOptions options = Ort::SessionOptions()) {
    if (threads > 0) options.SetIntraOpNumThreads(threads);
    options.SetInterOpNumThreads(1);
    options.SetGraphOptimizationLevel(GraphOptimizationLevel::ORT_ENABLE_ALL);
    session_ = std::make_unique<Ort::Session>(sharedEnv(), path.c_str(), options);
    Ort::AllocatorWithDefaultOptions allocator;
    for (size_t i = 0; i < session_->GetInputCount(); i++) {
      inputs_.push_back(describe(session_->GetInputNameAllocated(i, allocator).get(), session_->GetInputTypeInfo(i)));
    }
    for (size_t i = 0; i < session_->GetOutputCount(); i++) {
      outputs_.push_back(describe(session_->GetOutputNameAllocated(i, allocator).get(), session_->GetOutputTypeInfo(i)));
    }
  }

  const std::vector<TensorInfo> &inputs() const { return inputs_; }
  const std::vector<TensorInfo> &outputs() const { return outputs_; }

  /// Run once. Outputs come back in the order of `outputNames` (all of the model's when empty), copied.
  std::vector<Output> run(const std::vector<InputView> &inputs, std::vector<std::string> outputNames) {
    if (outputNames.empty()) {
      for (const TensorInfo &info : outputs_) outputNames.push_back(info.name);
    }
    static const Ort::MemoryInfo memory = Ort::MemoryInfo::CreateCpu(OrtArenaAllocator, OrtMemTypeDefault);
    std::vector<Ort::Value> values;
    std::vector<const char *> inputNames;
    // Converted copies of integer inputs; they must outlive the Run call.
    std::vector<std::vector<int64_t>> longs;
    std::vector<std::vector<int32_t>> ints;
    longs.reserve(inputs.size());
    ints.reserve(inputs.size());
    values.reserve(inputs.size());
    for (const InputView &input : inputs) {
      if (elementCount(input.dims) != input.count) throw std::runtime_error("Input " + input.name + " has the wrong number of values");
      const std::string type = typeOf(input.name);
      if (type == "int64") {
        longs.emplace_back(input.count);
        for (size_t i = 0; i < input.count; i++) longs.back()[i] = (int64_t)std::llround(input.data[i]);
        values.push_back(Ort::Value::CreateTensor<int64_t>(memory, longs.back().data(), input.count, input.dims.data(), input.dims.size()));
      } else if (type == "int32") {
        ints.emplace_back(input.count);
        for (size_t i = 0; i < input.count; i++) ints.back()[i] = (int32_t)std::lround(input.data[i]);
        values.push_back(Ort::Value::CreateTensor<int32_t>(memory, ints.back().data(), input.count, input.dims.data(), input.dims.size()));
      } else {
        values.push_back(Ort::Value::CreateTensor<float>(memory, const_cast<float *>(input.data), input.count, input.dims.data(), input.dims.size()));
      }
      inputNames.push_back(input.name.c_str());
    }
    std::vector<const char *> names;
    for (const std::string &name : outputNames) names.push_back(name.c_str());
    Ort::RunOptions runOptions{nullptr};
    auto results = session_->Run(runOptions, inputNames.data(), values.data(), values.size(), names.data(), names.size());
    std::vector<Output> outputs;
    for (size_t i = 0; i < results.size(); i++) {
      auto info = results[i].GetTensorTypeAndShapeInfo();
      if (info.GetElementType() != ONNX_TENSOR_ELEMENT_DATA_TYPE_FLOAT) throw std::runtime_error("Output " + outputNames[i] + " isn't float32");
      Output output{outputNames[i], info.GetShape(), {}};
      const float *data = results[i].GetTensorData<float>();
      output.data.assign(data, data + info.GetElementCount());
      outputs.push_back(std::move(output));
    }
    return outputs;
  }

 private:
  std::string typeOf(const std::string &name) const {
    for (const TensorInfo &info : inputs_) {
      if (info.name == name) return info.type;
    }
    throw std::runtime_error("The model has no input " + name);
  }

  static TensorInfo describe(const char *name, const Ort::TypeInfo &type) {
    TensorInfo info{name, {}, "other"};
    if (type.GetONNXType() == ONNX_TYPE_TENSOR) {
      auto tensor = type.GetTensorTypeAndShapeInfo();
      info.dims = tensor.GetShape();
      info.type = typeName(tensor.GetElementType());
    }
    return info;
  }

  std::unique_ptr<Ort::Session> session_;
  std::vector<TensorInfo> inputs_, outputs_;
};

/// The sessions JS holds, by id.
class Registry {
 public:
  static Registry &shared() {
    static Registry registry;
    return registry;
  }

  int add(std::shared_ptr<Session> session) {
    std::lock_guard<std::mutex> lock(mutex_);
    const int id = next_++;
    sessions_[id] = std::move(session);
    return id;
  }

  std::shared_ptr<Session> get(int id) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto found = sessions_.find(id);
    if (found == sessions_.end()) throw std::runtime_error("No ONNX session " + std::to_string(id) + " (it was released)");
    return found->second;
  }

  void release(int id) {
    std::lock_guard<std::mutex> lock(mutex_);
    sessions_.erase(id);
  }

 private:
  std::mutex mutex_;
  std::map<int, std::shared_ptr<Session>> sessions_;
  int next_ = 1;
};

/// Split `bytes` (each input's float32 values back to back, in order) into views for `run`.
inline std::vector<InputView> unpackInputs(const std::vector<std::string> &names, const std::vector<std::vector<int64_t>> &dims,
                                           const uint8_t *bytes, size_t byteLength) {
  if (names.size() != dims.size()) throw std::runtime_error("Each input needs a name and a shape");
  std::vector<InputView> views;
  size_t offset = 0;
  for (size_t i = 0; i < names.size(); i++) {
    const size_t count = elementCount(dims[i]);
    if (offset + count * 4 > byteLength) throw std::runtime_error("The input data is shorter than the shapes say");
    views.push_back({names[i], dims[i], reinterpret_cast<const float *>(bytes + offset), count});
    offset += count * 4;
  }
  if (offset != byteLength) throw std::runtime_error("The input data is longer than the shapes say");
  return views;
}

/// Outputs for JS, in one buffer: int32 count, then per output its rank and sizes (int32s), then every output's
/// float32 values back to back in the same order. Read by `runOnnx` in modules/gemma-embed/index.ts.
inline size_t packedSize(const std::vector<Output> &outputs) {
  size_t words = 1;
  for (const Output &output : outputs) words += 1 + output.dims.size() + output.data.size();
  return words * 4;
}

/// Write `outputs` packed as above into `destination`, which holds `packedSize(outputs)` bytes. Writing straight
/// into the buffer JS gets saves a copy of what can be tens of megabytes (EdgeTAM's features).
inline void packInto(const std::vector<Output> &outputs, uint8_t *destination) {
  std::vector<int32_t> header{(int32_t)outputs.size()};
  for (const Output &output : outputs) {
    header.push_back((int32_t)output.dims.size());
    for (int64_t d : output.dims) header.push_back((int32_t)d);
  }
  std::memcpy(destination, header.data(), header.size() * 4);
  size_t offset = header.size() * 4;
  for (const Output &output : outputs) {
    std::memcpy(destination + offset, output.data.data(), output.data.size() * 4);
    offset += output.data.size() * 4;
  }
}

}  // namespace lens_onnx
