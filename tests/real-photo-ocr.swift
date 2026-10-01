import Foundation
import CoreGraphics
import ImageIO
import Vision

@main struct PhotoOCR {
    static func main() throws {
        let root = URL(fileURLWithPath: "experiments/private-vision/NativeCore/Tests/BenzaPrivateVisionTests/Fixtures")
        var report: [[String: Any]] = []
        for side in ["obverse","reverse"] {
            let encoded=try String(contentsOf: root.appendingPathComponent("maple-\(side).b64"))
            guard let data=Data(base64Encoded: encoded.trimmingCharacters(in: .whitespacesAndNewlines)),
                  let source=CGImageSourceCreateWithData(data as CFData,nil),
                  let raw=CGImageSourceCreateImageAtIndex(source,0,nil),
                  let context=CGContext(data:nil,width:raw.width,height:raw.height,bitsPerComponent:8,
                    bytesPerRow:raw.width*4,space:CGColorSpaceCreateDeviceRGB(),
                    bitmapInfo:CGImageAlphaInfo.noneSkipLast.rawValue) else {
                throw NSError(domain:"PhotoFixture",code:1,userInfo:[NSLocalizedDescriptionKey:side+" could not decode"])
            }
            context.draw(raw,in:CGRect(x:0,y:0,width:raw.width,height:raw.height))
            guard let image=context.makeImage() else { throw NSError(domain:"PhotoFixture",code:2) }
            let started=Date()
            let rims=BenzaCoinRim.readingImages(image)
            guard !rims.isEmpty else { throw NSError(domain:"RimLocalization",code:3,userInfo:[NSLocalizedDescriptionKey:side+" found no coin outline"]) }
            // Small image diagnostics from approved coin-only fixtures.
            for (index,rim) in rims.prefix(2).enumerated() {
                let thumb=CGContext(data:nil,width:min(1200,rim.width),height:max(1,rim.height*min(1200,rim.width)/rim.width),bitsPerComponent:8,bytesPerRow:0,space:CGColorSpaceCreateDeviceGray(),bitmapInfo:0)!
                thumb.draw(rim,in:CGRect(x:0,y:0,width:thumb.width,height:thumb.height))
                let bytes=NSMutableData()
                if let preview=thumb.makeImage(),let destination=CGImageDestinationCreateWithData(bytes,"public.jpeg" as CFString,1,nil) {
                    CGImageDestinationAddImage(destination,preview,[kCGImageDestinationLossyCompressionQuality:0.75] as CFDictionary)
                    if CGImageDestinationFinalize(destination) { print("RIM_PREVIEW \(side) \(index) "+(bytes as Data).base64EncodedString()) }
                }
            }
            var readings:[[String:Any]]=[]
            for (index,photo) in ([image]+rims).enumerated() {
                let request=VNRecognizeTextRequest()
                request.recognitionLevel = .accurate
                request.usesLanguageCorrection=index==0
                let supported=(try? request.supportedRecognitionLanguages()) ?? ["en-US"]
                request.recognitionLanguages=["en-US","fr-FR","es-ES","de-DE"].filter { supported.contains($0) }
                request.minimumTextHeight=0.002
                request.customWords=["CANADA","FINE SILVER","ARGENT PUR","1 OZ","9999"]
                let passStarted=Date()
                try VNImageRequestHandler(cgImage:photo).perform([request])
                let observations=(request.results ?? []).compactMap { observation -> [String:Any]? in
                    guard let text=observation.topCandidates(1).first,text.confidence>=0.25 else {return nil}
                    return ["text":text.string,"confidence":Double(text.confidence)]
                }
                readings.append(["id":index,"observations":observations,"elapsedMs":Int(Date().timeIntervalSince(passStarted)*1000)])
            }
            report.append(["side":side,"passes":readings,"rimImages":rims.count,"elapsedMs":Int(Date().timeIntervalSince(started)*1000)])
        }
        let json=try JSONSerialization.data(withJSONObject:report,options:[.prettyPrinted,.sortedKeys])
        try json.write(to:URL(fileURLWithPath:"/tmp/benza-real-photo-readings.json"))
        print(String(decoding:json,as:UTF8.self))
    }
}
