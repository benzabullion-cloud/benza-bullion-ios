import Foundation
import CoreGraphics
import CryptoKit
import CBenzaVision

public final class BenzaOfflineScan: @unchecked Sendable {
    fileprivate let handle: OpaquePointer
    private let lock = NSLock()
    private var canceled = false

    public init() throws {
        guard let value = benza_scan_create() else { throw BenzaOfflineDesignEngine.Failure.unavailable }
        handle = value
    }
    public func cancel() {
        lock.lock()
        canceled = true
        benza_scan_cancel(handle)
        lock.unlock()
    }
    public var isCanceled: Bool {
        lock.lock()
        defer { lock.unlock() }
        return canceled
    }
    deinit { _ = benza_scan_destroy(handle) }
}

// Synchronous inference: the app owns its serial background queue and scan token.
// Retains only verified file paths between calls, never images or inference state.
public final class BenzaOfflineDesignEngine {
    public enum Failure: Error { case unavailable, canceled, busy, invalidReply }
    private let directory: URL
    private var verified = false
    private let workerLock = NSLock()
    private let files: [(String, Int64, String)] = [
        ("Qwen3VL-2B-Instruct-Q4_K_M.gguf", 1107409952,
         "089d75c52f4b7ffc56ba998ffc50aae89fcafc755f9e7208aacca281dca6c2ae"),
        ("mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf", 445053216,
         "f9a68fabba69c3b81e153367b2c7521030b0fa8bb0de400c9599c8e6725f9c82")
    ]

    public init(directory: URL) throws {
        guard directory.isFileURL else { throw Failure.unavailable }
        self.directory = directory
    }

    private func verifyFiles(scan: BenzaOfflineScan) throws {
        if verified { return }
        for (name, size, expected) in files {
            let url = directory.appendingPathComponent(name)
            let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
            guard (attributes[.size] as? NSNumber)?.int64Value == size,
                  let stream = InputStream(url: url) else { throw Failure.unavailable }
            stream.open()
            defer { stream.close() }
            var hash = SHA256()
            var buffer = [UInt8](repeating: 0, count: 65536)
            while true {
                if scan.isCanceled { throw Failure.canceled }
                let count = stream.read(&buffer, maxLength: buffer.count)
                if count < 0 { throw Failure.unavailable }
                if count == 0 { break }
                hash.update(data: Data(buffer.prefix(count)))
            }
            let digest = hash.finalize().map { String(format: "%02x", $0) }.joined()
            guard digest == expected else { throw Failure.unavailable }
        }
        verified = true
    }

    public func identify(image: CGImage, scan: BenzaOfflineScan) throws -> BenzaDesignIdentity {
        guard workerLock.try() else { throw Failure.busy }
        defer { workerLock.unlock() }
        if scan.isCanceled { throw Failure.canceled }
        try verifyFiles(scan: scan)
        if scan.isCanceled { throw Failure.canceled }
        guard let promptURL = Bundle.module.url(forResource: "catalogue-prompt", withExtension: "txt", subdirectory: "Resources") else {
            throw Failure.unavailable
        }
        let prompt = try String(contentsOf: promptURL, encoding: .utf8)
        let scale = min(1, 1600.0 / Double(max(image.width, image.height)))
        let width = max(1, Int(Double(image.width) * scale))
        let height = max(1, Int(Double(image.height) * scale))
        var rgba = [UInt8](repeating: 0, count: width * height * 4)
        let drawn = rgba.withUnsafeMutableBytes { bytes -> Bool in
            guard let context = CGContext(data: bytes.baseAddress, width: width, height: height,
                                          bitsPerComponent: 8, bytesPerRow: width * 4,
                                          space: CGColorSpaceCreateDeviceRGB(),
                                          bitmapInfo: CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.noneSkipLast.rawValue) else { return false }
            context.interpolationQuality = .high
            context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
            return true
        }
        guard drawn else { throw Failure.unavailable }
        var rgb = [UInt8](repeating: 0, count: width * height * 3)
        for index in 0..<(width * height) {
            rgb[index * 3] = rgba[index * 4]
            rgb[index * 3 + 1] = rgba[index * 4 + 1]
            rgb[index * 3 + 2] = rgba[index * 4 + 2]
        }
        var output = [CChar](repeating: 0, count: 1025)
        let model = directory.appendingPathComponent(files[0].0).path
        let projector = directory.appendingPathComponent(files[1].0).path
        let status = withExtendedLifetime(scan) {
            model.withCString { modelPath in
                projector.withCString { projectorPath in
                    prompt.withCString { promptText in
                        rgb.withUnsafeBufferPointer { pixels in
                            output.withUnsafeMutableBufferPointer { buffer in
                                benza_scan_rgb(scan.handle, modelPath, projectorPath, promptText,
                                               pixels.baseAddress, pixels.count, UInt32(width), UInt32(height),
                                               1, 45, buffer.baseAddress, buffer.count)
                            }
                        }
                    }
                }
            }
        }
        if scan.isCanceled || status == 2 { throw Failure.canceled }
        if status == 3 { throw Failure.busy }
        guard status == 0 else { throw Failure.unavailable }
        do { return try BenzaDesignIdentity.parse(String(cString: output)) }
        catch { throw Failure.invalidReply }
    }
}
