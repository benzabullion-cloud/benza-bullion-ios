import Foundation
import CoreGraphics

/// Geometry only: never supplies a bullion identity, metal, purity or weight.
public enum BenzaCoinRim {
    public static func readingImages(_ image: CGImage, maximumCandidates: Int = 2, isCanceled: () -> Bool = { false }) -> [CGImage] {
        guard !isCanceled() else { return [] }
        // A small software raster avoids Vision contour/model startup and gives
        // a bounded geometric search independent of coin family and inscriptions.
        let scale = min(1, 224.0 / Double(max(image.width,image.height)))
        let w = max(1,Int(Double(image.width)*scale)), h = max(1,Int(Double(image.height)*scale))
        var pixels = [UInt8](repeating:255,count:w*h)
        let drawn = pixels.withUnsafeMutableBytes { buffer -> Bool in
            guard let context = CGContext(data:buffer.baseAddress,width:w,height:h,bitsPerComponent:8,
                bytesPerRow:w,space:CGColorSpaceCreateDeviceGray(),bitmapInfo:0) else { return false }
            context.interpolationQuality = .high
            context.draw(image,in:CGRect(x:0,y:0,width:w,height:h))
            return true
        }
        guard drawn else { return [] }
        let angles = (0..<48).map { index -> (Double,Double) in
            let theta = Double(index)*2*Double.pi/48
            return (cos(theta),sin(theta))
        }
        let shorter = Double(min(w,h))
        var candidates: [(CGRect,Double)] = []
        for cy in stride(from:Int(Double(h)*0.20),to:Int(Double(h)*0.80),by:4) {
            if isCanceled() { return [] }
            for cx in stride(from:Int(Double(w)*0.22),to:Int(Double(w)*0.78),by:4) {
                for ratio in [0.75,0.85,1.0,1.15,1.30] {
                    for rx in stride(from:shorter*0.18,to:shorter*0.54,by:2) {
                        let ry = rx*ratio
                        var valid=0,covered=0
                        var strength=0.0,signed=0.0
                        for (cosine,sine) in angles {
                            let x0=Int((Double(cx)+(rx-2)*cosine).rounded())
                            let y0=Int((Double(cy)+(ry-2)*sine).rounded())
                            let x1=Int((Double(cx)+(rx+2)*cosine).rounded())
                            let y1=Int((Double(cy)+(ry+2)*sine).rounded())
                            guard x0>=0,x0<w,y0>=0,y0<h,x1>=0,x1<w,y1>=0,y1<h else { continue }
                            let difference=Double(pixels[y0*w+x0])-Double(pixels[y1*w+x1])
                            valid+=1;strength+=abs(difference);signed+=difference
                            if abs(difference)>16 { covered+=1 }
                        }
                        guard valid>=46,covered>=32 else { continue }
                        strength/=48
                        let coverage=Double(covered)/48
                        let score=strength*(0.5+coverage)*(0.75+0.25*abs(signed/48)/max(strength,1))
                        guard score>15 else { continue }
                        // Vision/CoreGraphics boxes use lower-left normalized coordinates.
                        let box=CGRect(x:(Double(cx)-rx)/Double(w),
                            y:1-(Double(cy)+ry)/Double(h),width:2*rx/Double(w),height:2*ry/Double(h))
                        candidates.append((box,score))
                    }
                }
            }
        }
        candidates.sort { $0.1>$1.1 }
        var boxes:[CGRect]=[]
        for candidate in candidates {
            if boxes.contains(where: {
                abs(($0.midX-candidate.0.midX)*Double(w))<shorter*0.05 &&
                abs(($0.midY-candidate.0.midY)*Double(h))<shorter*0.05 &&
                abs(($0.width-candidate.0.width)*Double(w))<shorter*0.14
            }) { continue }
            boxes.append(candidate.0)
            if boxes.count==max(1,min(3,maximumCandidates)) { break }
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
