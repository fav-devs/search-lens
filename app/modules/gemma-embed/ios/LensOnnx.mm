#import "LensOnnx.h"

#include "LensOnnxCore.hpp"
#if __has_include(<onnxruntime-c/coreml_provider_factory.h>)
#include <onnxruntime-c/coreml_provider_factory.h>
#define LENS_HAS_COREML 1
#elif __has_include("coreml_provider_factory.h")
#include "coreml_provider_factory.h"
#define LENS_HAS_COREML 1
#endif

static NSError *LensOnnxError(NSString *message) {
  return [NSError errorWithDomain:@"LensOnnx" code:1 userInfo:@{NSLocalizedDescriptionKey : message}];
}

static NSArray<NSDictionary<NSString *, id> *> *LensOnnxDescribe(const std::vector<lens_onnx::TensorInfo> &infos) {
  NSMutableArray *described = [NSMutableArray arrayWithCapacity:infos.size()];
  for (const auto &info : infos) {
    NSMutableArray<NSNumber *> *dims = [NSMutableArray arrayWithCapacity:info.dims.size()];
    for (int64_t d : info.dims) [dims addObject:@(d)];
    [described addObject:@{
      @"name" : [NSString stringWithUTF8String:info.name.c_str()],
      @"dims" : dims,
      @"type" : [NSString stringWithUTF8String:info.type.c_str()],
    }];
  }
  return described;
}

@implementation LensOnnxRunner

+ (NSDictionary<NSString *, id> *)createSessionWithPath:(NSString *)path
                                                threads:(NSInteger)threads
                                              useCoreML:(BOOL)useCoreML
                                                  error:(NSError **)error {
  if ([path hasPrefix:@"file://"]) path = [NSURL URLWithString:path].path;
  if (![[NSFileManager defaultManager] fileExistsAtPath:path]) {
    if (error) *error = LensOnnxError([NSString stringWithFormat:@"The model file isn't there: %@", path]);
    return nil;
  }
  try {
    Ort::SessionOptions options;
#if LENS_HAS_COREML
    if (useCoreML) {
      // Whatever Core ML can't take stays on the CPU; if it can't be added at all, carry on with the CPU.
      try {
        Ort::ThrowOnError(OrtSessionOptionsAppendExecutionProvider_CoreML(options, 0));
      } catch (...) {
      }
    }
#endif
    auto session = std::make_shared<lens_onnx::Session>(path.UTF8String, (int)threads, std::move(options));
    const int sessionId = lens_onnx::Registry::shared().add(session);
    return @{
      @"id" : @(sessionId),
      @"inputs" : LensOnnxDescribe(session->inputs()),
      @"outputs" : LensOnnxDescribe(session->outputs()),
    };
  } catch (const std::exception &failure) {
    if (error) *error = LensOnnxError([NSString stringWithUTF8String:failure.what()]);
    return nil;
  }
}

+ (NSData *)runSession:(NSInteger)sessionId
            inputNames:(NSArray<NSString *> *)names
                  dims:(NSArray<NSArray<NSNumber *> *> *)dims
                  data:(NSData *)data
           outputNames:(NSArray<NSString *> *)outputNames
                 error:(NSError **)error {
  try {
    std::vector<std::string> inputNames;
    for (NSString *name in names) inputNames.push_back(name.UTF8String);
    std::vector<std::vector<int64_t>> shapes;
    for (NSArray<NSNumber *> *shape in dims) {
      std::vector<int64_t> sizes;
      for (NSNumber *size in shape) sizes.push_back(size.longLongValue);
      shapes.push_back(sizes);
    }
    std::vector<std::string> wanted;
    for (NSString *name in outputNames) wanted.push_back(name.UTF8String);
    auto session = lens_onnx::Registry::shared().get((int)sessionId);
    auto inputs = lens_onnx::unpackInputs(inputNames, shapes, (const uint8_t *)data.bytes, data.length);
    auto packed = lens_onnx::packOutputs(session->run(inputs, wanted));
    return [NSData dataWithBytes:packed.data() length:packed.size()];
  } catch (const std::exception &failure) {
    if (error) *error = LensOnnxError([NSString stringWithUTF8String:failure.what()]);
    return nil;
  }
}

+ (void)releaseSession:(NSInteger)sessionId {
  lens_onnx::Registry::shared().release((int)sessionId);
}

@end
