import Foundation
import CoreGraphics
import ImageIO
import Vision

@main struct PhotoOCR {
    static func main() throws {
        // A private manifest can add authorized local photos without publishing pixels.
        let manifestPath=ProcessInfo.processInfo.environment["BENZA_SCANNER_PHOTO_MANIFEST"] ?? "tests/scanner-photo-cases.json"
        let manifestData=try Data(contentsOf:URL(fileURLWithPath:manifestPath))
        guard let manifest=try JSONSerialization.jsonObject(with:manifestData) as? [String:Any],
              let cases=manifest["cases"] as? [[String:Any]], !cases.isEmpty else { throw NSError(domain:"PhotoManifest",code:1) }
        // Use the app's complete OCR vocabulary, never a fixture-specific dictionary.
        let app=try String(contentsOf:URL(fileURLWithPath:"App/SceneDelegate.swift"),encoding:.utf8)
        let pattern=try NSRegularExpression(pattern:"request\\.customWords\\s*=\\s*(\\[[\\s\\S]*?\\])")
        guard let match=pattern.firstMatch(in:app,range:NSRange(app.startIndex...,in:app)),let range=Range(match.range(at:1),in:app) else { throw NSError(domain:"OCRSettings",code:1) }
        let vocabulary=try JSONDecoder().decode([String].self,from:Data(app[range].utf8))
        var report: [[String: Any]] = []
        for fixture in cases {
          guard let caseID=fixture["id"] as? String,let photos=fixture["photos"] as? [[String:String]],photos.count==2 else { throw NSError(domain:"PhotoManifest",code:2) }
          for photo in photos {
            guard let side=photo["side"],let path=photo["path"] else { throw NSError(domain:"PhotoManifest",code:3) }
            let file:URL
            if path.hasPrefix("https://www.usmint.gov/") {
                guard let remote=URL(string:path) else { throw NSError(domain:"PhotoManifest",code:4) }
                file=remote
            } else { file=URL(fileURLWithPath:path) }
            let bytes=try Data(contentsOf:file)
            let data:Data
            if file.pathExtension == "b64" {
                guard let decoded=Data(base64Encoded:String(decoding:bytes,as:UTF8.self).trimmingCharacters(in:.whitespacesAndNewlines)) else { throw NSError(domain:"PhotoFixture",code:4) }
                data=decoded
            } else { data=bytes }
            guard
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
            let rims=BenzaCoinRim.readingImages(image,maximumCandidates:1)
            guard !rims.isEmpty else { throw NSError(domain:"RimLocalization",code:3,userInfo:[NSLocalizedDescriptionKey:side+" found no coin outline"]) }
            let rimElapsedMs=Int(Date().timeIntervalSince(started)*1000)
            // Optional diagnostics contain only approved coin-only fixture pixels.
            if ProcessInfo.processInfo.environment["BENZA_RIM_PREVIEWS"] == "1" {
            for (index,rim) in rims.prefix(2).enumerated() {
                let thumb=CGContext(data:nil,width:min(1200,rim.width),height:max(1,rim.height*min(1200,rim.width)/rim.width),bitsPerComponent:8,bytesPerRow:0,space:CGColorSpaceCreateDeviceGray(),bitmapInfo:0)!
                thumb.draw(rim,in:CGRect(x:0,y:0,width:thumb.width,height:thumb.height))
                let bytes=NSMutableData()
                if let preview=thumb.makeImage(),let destination=CGImageDestinationCreateWithData(bytes,"public.jpeg" as CFString,1,nil) {
                    CGImageDestinationAddImage(destination,preview,[kCGImageDestinationLossyCompressionQuality:0.75] as CFDictionary)
                    if CGImageDestinationFinalize(destination) { print("RIM_PREVIEW \(side) \(index) "+(bytes as Data).base64EncodedString()) }
                }
            }
            }
            var readings:[[String:Any]]=[]
            for (index,photo) in ([image]+rims).enumerated() {
                let request=VNRecognizeTextRequest()
                request.recognitionLevel = .accurate
                request.usesLanguageCorrection=index==0
                let supported=(try? request.supportedRecognitionLanguages()) ?? ["en-US"]
                request.recognitionLanguages=["en-US","fr-FR","es-ES","de-DE"].filter { supported.contains($0) }
                if #available(macOS 13.0, *) { request.automaticallyDetectsLanguage = true }
                request.minimumTextHeight=0.002
                request.customWords=vocabulary
                let passStarted=Date()
                try VNImageRequestHandler(cgImage:photo).perform([request])
                let observations=(request.results ?? []).compactMap { observation -> [String:Any]? in
                    guard let text=observation.topCandidates(1).first,text.confidence>=0.25 else {return nil}
                    let line=text.string.trimmingCharacters(in:.whitespacesAndNewlines)
                    guard !line.isEmpty else {return nil}
                    return ["text":line,"confidence":Double(text.confidence)]
                }
                // Match the native bridge's Float sum / observation count.
                let confidenceSum=observations.reduce(Float(0)) { sum,observation in sum+Float(observation["confidence"] as? Double ?? 0) }
                let confidence=observations.isEmpty ? 0 : Double(confidenceSum)/Double(observations.count)
                readings.append(["id":index,"confidence":confidence,"observations":observations,"elapsedMs":Int(Date().timeIntervalSince(passStarted)*1000)])
            }
            report.append(["caseId":caseID,"side":side,"passes":readings,"rimImages":rims.count,"rimElapsedMs":rimElapsedMs,"elapsedMs":Int(Date().timeIntervalSince(started)*1000)])
          }
        }
        let json=try JSONSerialization.data(withJSONObject:report,options:[.prettyPrinted,.sortedKeys])
        try json.write(to:URL(fileURLWithPath:"/tmp/benza-real-photo-readings.json"))
        print(String(decoding:json,as:UTF8.self))
    }
}
