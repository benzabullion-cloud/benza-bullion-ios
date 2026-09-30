import XCTest
import CBenzaVision
import CoreGraphics
@testable import BenzaPrivateVision

final class NativeBoundaryTests: XCTestCase {
    func testCanceledAdapterSkipsAssetsAndImageWork() throws {
        let scan = try BenzaOfflineScan()
        scan.cancel()
        let engine = try BenzaOfflineDesignEngine(directory: URL(fileURLWithPath: "/not-an-asset-directory"))
        let context = try XCTUnwrap(CGContext(data: nil, width: 1, height: 1, bitsPerComponent: 8,
                                             bytesPerRow: 4, space: CGColorSpaceCreateDeviceRGB(),
                                             bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue))
        let image = try XCTUnwrap(context.makeImage())
        XCTAssertThrowsError(try engine.identify(image: image, scan: scan)) { error in
            guard case BenzaOfflineDesignEngine.Failure.canceled = error else {
                return XCTFail("Cancellation must precede file access")
            }
        }
    }

    func testModelCannotSupplySpecifications() throws {
        let result = try BenzaDesignIdentity.parse(#"{"design_id":"american_eagle"}"#)
        XCTAssertEqual(result.design, .americanEagle)
        XCTAssertFalse(result.canCreateHolding)
        for invalid in [#"{"design_id":"american_eagle","weight_oz":20}"#,
                        #"{"product_family":"American Eagle","metal":"Silver","weight_oz":"20.0"}"#,
                        #"{"design_id":"unknown","design_id":"american_eagle"}"#,
                        #"{"design_id":"silver_round"}"#] {
            XCTAssertThrowsError(try BenzaDesignIdentity.parse(invalid))
        }
    }

    func testUnknownAndFencedReplies() throws {
        XCTAssertFalse(try BenzaDesignIdentity.parse(#"{"design_id":"unknown"}"#).requiresIndependentSpecifications)
        XCTAssertEqual(try BenzaDesignIdentity.parse("```json\n{\"design_id\":\"canadian_maple_leaf\"}\n```").design, .canadianMapleLeaf)
    }

    func testCanceledHandleCannotStartOrBeReused() throws {
        let handle = try XCTUnwrap(benza_scan_create())
        defer { XCTAssertEqual(benza_scan_destroy(handle), 0) }
        benza_scan_cancel(handle)
        let rgb: [UInt8] = [0, 0, 0]
        var output = [CChar](repeating: 0, count: 1025)
        func run() -> Int32 {
            rgb.withUnsafeBufferPointer { pixels in
                output.withUnsafeMutableBufferPointer { buffer in
                    "/not-a-model".withCString { model in
                        "test".withCString { prompt in
                            benza_scan_rgb(handle, model, model, prompt,
                                           pixels.baseAddress, pixels.count, 1, 1,
                                           0, 30, buffer.baseAddress, buffer.count)
                        }
                    }
                }
            }
        }
        XCTAssertEqual(run(), 2)
        XCTAssertEqual(output[0], 0)
        XCTAssertEqual(benza_scan_is_running(handle), 0)
        XCTAssertEqual(run(), 4)
        XCTAssertEqual(output[0], 0)
    }
    func testCanceledWrapperDoesNotReadAssetsOrLoadModel() throws {
        let engine = try BenzaOfflineDesignEngine(directory: URL(fileURLWithPath: "/missing-models"))
        let scan = try BenzaOfflineScan()
        scan.cancel()
        let context = try XCTUnwrap(CGContext(data: nil, width: 1, height: 1,
            bitsPerComponent: 8, bytesPerRow: 4, space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue))
        let image = try XCTUnwrap(context.makeImage())
        XCTAssertThrowsError(try engine.identify(image: image, scan: scan)) { error in
            guard case BenzaOfflineDesignEngine.Failure.canceled = error else {
                return XCTFail("Canceled wrapper attempted asset loading")
            }
        }
    }

    func testRemoteAssetDirectoryIsRejected() {
        XCTAssertThrowsError(try BenzaOfflineDesignEngine(directory: URL(string: "https://example.invalid/models")!))
    }

}
