#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// Any ONNX model from JS: sessions by id, float32 values in and out (LensOnnxCore.hpp does the work; integer inputs
/// are converted there). From the Sondr app's SondrOnnxRunner.
@interface LensOnnxRunner : NSObject

/// Load a model. Returns @{ @"id": session id, @"inputs" / @"outputs": [@{ @"name", @"dims" (-1 = open), @"type" }] }.
/// `threads` 0 lets ONNX Runtime choose; `useCoreML` puts what Core ML can take on it.
+ (nullable NSDictionary<NSString *, id> *)createSessionWithPath:(NSString *)path
                                                         threads:(NSInteger)threads
                                                       useCoreML:(BOOL)useCoreML
                                                           error:(NSError **)error;

/// Run once. `data` holds each input's float32 values back to back, in the order of `names`; the result packs the
/// outputs as an int32 count, each output's rank and sizes (int32s), then their float32 values back to back.
+ (nullable NSData *)runSession:(NSInteger)sessionId
                     inputNames:(NSArray<NSString *> *)names
                           dims:(NSArray<NSArray<NSNumber *> *> *)dims
                           data:(NSData *)data
                    outputNames:(NSArray<NSString *> *)outputNames
                          error:(NSError **)error;

+ (void)releaseSession:(NSInteger)sessionId;

@end

NS_ASSUME_NONNULL_END
