import XCTest
import Foundation
import CoreGraphics
import ImageIO
import Vision
@testable import BenzaPrivateVision

final class CoinRimPhotoTests: XCTestCase {
    func testCanceledRimWorkReturnsImmediately() {
        let context = CGContext(data: nil, width: 32, height: 32, bitsPerComponent: 8,
            bytesPerRow: 32, space: CGColorSpaceCreateDeviceGray(), bitmapInfo: 0)!
        XCTAssertTrue(BenzaCoinRim.readingImages(context.makeImage()!, isCanceled: { true }).isEmpty)
    }
    func testGenericCoinOutlineAndRectification() throws {
        let context = try XCTUnwrap(CGContext(data: nil, width: 800, height: 1000, bitsPerComponent: 8,
            bytesPerRow: 800, space: CGColorSpaceCreateDeviceGray(), bitmapInfo: 0))
        context.setFillColor(gray: 1, alpha: 1)
        context.fill(CGRect(x: 0,y: 0,width: 800,height: 1000))
        context.setStrokeColor(gray: 0, alpha: 1)
        context.setLineWidth(4)
        context.setFillColor(gray: 0.35, alpha: 1)
        context.fillEllipse(in: CGRect(x: 100,y: 200,width: 600,height: 600))
        let image = try XCTUnwrap(context.makeImage())
        let strips = BenzaCoinRim.readingImages(image, maximumCandidates: 1)
        XCTAssertEqual(strips.count, 2)
        XCTAssertTrue(strips.allSatisfy { $0.width > $0.height && $0.height >= 80 })
    }
}
