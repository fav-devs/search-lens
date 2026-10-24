#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// One run's outputs, packed for JS as an int32 count, each output's rank and sizes (int32s), then their float32
/// values back to back. Held natively until written into the buffer JS gets, so they are copied once.
@interface LensOnnxResult : NSObject
@property(nonatomic, readonly) NSUInteger length;
/// Write the `length` packed bytes to `destination`.
- (void)writeTo:(void *)destination;
@end

/// Any ONNX model from JS: sessions by id, float32 values in and out (LensOnnxCore.hpp does the work; integer inputs
/// are converted there). From the Sondr app's SondrOnnxRunner.
@interface LensOnnxRunner : NSObject

/// Load a model. Returns @{ @"id": session id, @"inputs" / @"outputs": [@{ @"name", @"dims" (-1 = open), @"type" }] }.
/// `threads` 0 lets ONNX Runtime choose; `useCoreML` puts what Core ML can take on it.
+ (nullable NSDictionary<NSString *, id> *)createSessionWithPath:(NSString *)path
                                                         threads:(NSInteger)threads
                                                       useCoreML:(BOOL)useCoreML
                                                           error:(NSError **)error;

/// Run once. `bytes` holds each input's float32 values back to back, in the order of `names` (read, not kept).
/// `outputNames` empty means all of the model's outputs.
+ (nullable LensOnnxResult *)runSession:(NSInteger)sessionId
                             inputNames:(NSArray<NSString *> *)names
                                   dims:(NSArray<NSArray<NSNumber *> *> *)dims
                                  bytes:(nullable const void *)bytes
                                 length:(NSUInteger)length
                            outputNames:(NSArray<NSString *> *)outputNames
                                  error:(NSError **)error;

+ (void)releaseSession:(NSInteger)sessionId;

@end

NS_ASSUME_NONNULL_END
