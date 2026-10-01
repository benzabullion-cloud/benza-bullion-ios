import Foundation
import CoreGraphics
import Vision

/// Geometry only: never supplies a bullion identity, metal, purity or weight.
public enum BenzaCoinRim {
    public static func readingImages(_ image: CGImage, maximumCandidates: Int = 2, isCanceled: () -> Bool = { false }) -> [CGImage] {
        guard !isCanceled() else { return [] }
        let request = VNDetectContoursRequest()
        request.maximumImageDimension = 768
        request.contrastAdjustment = 1.5
        guard (try? VNImageRequestHandler(cgImage: image).perform([request])) != nil,
              let observation = request.results?.first else { return [] }
        let width = Double(image.width), height = Double(image.height)
        var candidates: [(CGRect, Double)] = []
        for index in 0..<min(observation.contourCount, 4000) {
            if isCanceled() { return [] }
            guard let contour = try? observation.contour(at: index), contour.pointCount >= 30 else { continue }
            let box = contour.normalizedPath.boundingBox
            let rx = Double(box.width) * width / 2, ry = Double(box.height) * height / 2
            guard rx > min(width,height) * 0.16, ry > min(width,height) * 0.16,
                  rx / ry > 0.65, rx / ry < 1.5 else { continue }
            let area = Double(box.width * box.height)
            guard area > 0.10, area < 0.995 else { continue }
            let cx = Double(box.midX), cy = Double(box.midY)
            guard abs(cx-0.5) < 0.28, abs(cy-0.5) < 0.30 else { continue }
            var deviation = 0.0
            var occupied = Set<Int>()
            for point in contour.normalizedPoints {
                let dx = (Double(point.x)-cx) / Double(box.width/2)
                let dy = (Double(point.y)-cy) / Double(box.height/2)
                deviation += abs(hypot(dx,dy)-1)
                occupied.insert(Int((atan2(dy,dx)+Double.pi)/(2*Double.pi)*24) % 24)
            }
            deviation /= Double(contour.pointCount)
            // Reject lettering, leaves, bars and incomplete arcs. Retain nested coin/capsule rims.
            guard deviation < 0.085, occupied.count >= 21 else { continue }
            candidates.append((box, area * (1-deviation)))
        }
        candidates.sort { $0.1 > $1.1 }
        var boxes: [CGRect] = []
        for candidate in candidates {
            if boxes.contains(where: {
                abs($0.midX-candidate.0.midX)<0.035 && abs($0.midY-candidate.0.midY)<0.035 &&
                abs($0.width-candidate.0.width)<0.075
            }) { continue }
            boxes.append(candidate.0)
            if boxes.count == max(1,min(3,maximumCandidates)) { break }
        }
        return boxes.flatMap { box -> [CGImage] in
            guard !isCanceled() else { return [] }
            return [unwrap(image, box: box, reverse: false),
                    unwrap(image, box: box, reverse: true)].compactMap { $0 }
        }
    }

    static func unwrap(_ image: CGImage, box: CGRect, reverse: Bool) -> CGImage? {
        let w = image.width, h = image.height
        var pixels = [UInt8](repeating: 0, count: w*h)
        let drawn = pixels.withUnsafeMutableBytes { buffer -> Bool in
            guard let context = CGContext(data: buffer.baseAddress, width: w, height: h,
                bitsPerComponent: 8, bytesPerRow: w, space: CGColorSpaceCreateDeviceGray(),
                bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return false }
            context.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
            return true
        }
        guard drawn else { return nil }
        let rx = Double(box.width)*Double(w)/2, ry = Double(box.height)*Double(h)/2
        let cx = Double(box.midX)*Double(w), cy = (1-Double(box.midY))*Double(h)
        let outWidth = min(2800, max(800, Int(2*Double.pi*max(rx,ry)*1.15)))
        let outHeight = max(80, Int(max(rx,ry)*0.44))
        var output = [UInt8](repeating: 255, count: outWidth*outHeight)
        for x in 0..<outWidth {
            // Extra 15% of a turn preserves words crossing the strip seam.
            let progress = Double(x)/Double(outWidth-1)
            let theta = -Double.pi + (reverse ? -1 : 1)*progress*2*Double.pi*1.15
            for y in 0..<outHeight {
                let fraction = Double(y)/Double(outHeight-1)
                let radius = reverse ? 0.58+fraction*0.44 : 1.02-fraction*0.44
                let sx = cx+rx*radius*cos(theta), sy = cy+ry*radius*sin(theta)
                let ix = Int(sx), iy = Int(sy)
                guard ix>=0, iy>=0, ix+1<w, iy+1<h else { continue }
                let fx=sx-Double(ix), fy=sy-Double(iy)
                let top=Double(pixels[iy*w+ix])*(1-fx)+Double(pixels[iy*w+ix+1])*fx
                let bottom=Double(pixels[(iy+1)*w+ix])*(1-fx)+Double(pixels[(iy+1)*w+ix+1])*fx
                output[y*outWidth+x]=UInt8(max(0,min(255,top*(1-fy)+bottom*fy)))
            }
        }
        let data = Data(output) as CFData
        guard let provider = CGDataProvider(data: data) else { return nil }
        return CGImage(width: outWidth, height: outHeight, bitsPerComponent: 8, bitsPerPixel: 8,
            bytesPerRow: outWidth, space: CGColorSpaceCreateDeviceGray(),
            bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.none.rawValue),
            provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent)
    }
}
