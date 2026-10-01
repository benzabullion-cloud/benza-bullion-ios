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
    func testActualMapleInscriptionsAndTiming() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("Fixtures")
        var report: [[String: Any]] = []
        for side in ["obverse", "reverse"] {
            let encoded = try String(contentsOf: root.appendingPathComponent("maple-\(side).b64"))
            let data = try XCTUnwrap(Data(base64Encoded: encoded.trimmingCharacters(in: .whitespacesAndNewlines)))
            let source = try XCTUnwrap(CGImageSourceCreateWithData(data as CFData, nil))
            let image = try XCTUnwrap(CGImageSourceCreateImageAtIndex(source, 0, nil))
            let started = Date()
            let rims = BenzaCoinRim.readingImages(image)
            XCTAssertFalse(rims.isEmpty, "Coin rim localization must find this photo")
            var readings: [[String: Any]] = []
            for (index, photo) in ([image]+rims).enumerated() {
                let request = VNRecognizeTextRequest()
                request.recognitionLevel = .accurate
                request.usesLanguageCorrection = index == 0
                request.recognitionLanguages = ["en-US", "fr-FR"]
                request.minimumTextHeight = 0.002
                request.customWords = ["CANADA", "FINE SILVER", "ARGENT PUR", "1 OZ", "9999"]
                let passStarted = Date()
                try VNImageRequestHandler(cgImage: photo).perform([request])
                let observations = (request.results ?? []).compactMap { observation -> [String: Any]? in
                    guard let text = observation.topCandidates(1).first, text.confidence >= 0.25 else { return nil }
                    return ["text": text.string, "confidence": Double(text.confidence)]
                }
                readings.append(["id": index, "observations": observations,
                    "elapsedMs": Int(Date().timeIntervalSince(passStarted)*1000)])
            }
            report.append(["side": side, "passes": readings, "rimImages": rims.count,
                "elapsedMs": Int(Date().timeIntervalSince(started)*1000)])
        }
        let json = try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted,.sortedKeys])
        try json.write(to: URL(fileURLWithPath: "/tmp/benza-real-photo-readings.json"))
        print("REAL PHOTO OCR: "+String(decoding: json, as: UTF8.self))
    }
}
