import UIKit
import Capacitor
import StoreKit
import UserNotifications
import Vision
import CoreImage
import ImageIO
import BenzaPrivateVision
import BackgroundAssets
import System

@objc(BenzaExportPlugin)
final class BenzaExportPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "BenzaExportPlugin"
    let jsName = "BenzaExport"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "shareFile", returnType: CAPPluginReturnPromise)
    ]
    private var sharing = false

    @objc func shareFile(_ call: CAPPluginCall) {
        guard let filename = call.getString("filename"),
              filename == URL(fileURLWithPath: filename).lastPathComponent,
              ["csv", "json"].contains(URL(fileURLWithPath: filename).pathExtension.lowercased()),
              let text = call.getString("text") else {
            call.reject("The export file is invalid.")
            return
        }
        DispatchQueue.main.async {
            guard !self.sharing, let presenter = self.bridge?.viewController,
                  presenter.viewIfLoaded?.window != nil,
                  presenter.presentedViewController == nil else {
                call.reject("Close the open dialog and try exporting again.")
                return
            }
            let directory = FileManager.default.temporaryDirectory
                .appendingPathComponent("benza-export-" + UUID().uuidString, isDirectory: true)
            let file = directory.appendingPathComponent(filename)
            do {
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                try Data(text.utf8).write(to: file, options: [.atomic, .completeFileProtection])
                self.sharing = true
                let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
                sheet.completionWithItemsHandler = { _, completed, _, error in
                    DispatchQueue.main.async {
                        self.sharing = false
                        try? FileManager.default.removeItem(at: directory)
                        if let error { call.reject(error.localizedDescription) }
                        else { call.resolve(["completed": completed]) }
                    }
                }
                if let popover = sheet.popoverPresentationController {
                    popover.sourceView = presenter.view
                    popover.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.midY, width: 1, height: 1)
                    popover.permittedArrowDirections = []
                }
                presenter.present(sheet, animated: true)
            } catch {
                try? FileManager.default.removeItem(at: directory)
                call.reject(error.localizedDescription)
            }
        }
    }
}

@objc(BenzaNotificationsPlugin)
final class BenzaNotificationsPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "BenzaNotificationsPlugin"
    let jsName = "BenzaNotifications"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "enable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "test", returnType: CAPPluginReturnPromise)
    ]

    private let tokenKey = "benza.apnsToken"
    private let errorKey = "benza.apnsRegistrationError"

    private func permissionName(_ status: UNAuthorizationStatus) -> String {
        switch status {
        case .authorized, .provisional, .ephemeral: return "granted"
        case .denied: return "denied"
        case .notDetermined: return "prompt"
        @unknown default: return "prompt"
        }
    }

    @objc func status(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            DispatchQueue.main.async {
                let token = UserDefaults.standard.string(forKey: self.tokenKey) ?? ""
                call.resolve([
                    "permission": self.permissionName(settings.authorizationStatus),
                    "token": token,
                    "registered": UIApplication.shared.isRegisteredForRemoteNotifications && !token.isEmpty
                ])
            }
        }
    }

    @objc func enable(_ call: CAPPluginCall) {
        Task { @MainActor in
            do {
                let center = UNUserNotificationCenter.current()
                let granted = try await center.requestAuthorization(options: [.alert, .badge, .sound])
                guard granted else {
                    call.resolve(["permission": "denied", "token": ""])
                    return
                }

                UserDefaults.standard.removeObject(forKey: errorKey)
                UIApplication.shared.registerForRemoteNotifications()

                if let existing = UserDefaults.standard.string(forKey: tokenKey), !existing.isEmpty {
                    call.resolve(["permission": "granted", "token": existing])
                    return
                }

                for _ in 0..<40 {
                    try await Task.sleep(nanoseconds: 250_000_000)
                    if let token = UserDefaults.standard.string(forKey: tokenKey), !token.isEmpty {
                        call.resolve(["permission": "granted", "token": token])
                        return
                    }
                    if let message = UserDefaults.standard.string(forKey: errorKey), !message.isEmpty {
                        call.reject(message)
                        return
                    }
                }

                call.reject("Apple did not return a notification device token. Please try again.")
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func disable(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            UIApplication.shared.unregisterForRemoteNotifications()
            UserDefaults.standard.removeObject(forKey: self.tokenKey)
            UserDefaults.standard.removeObject(forKey: self.errorKey)
            call.resolve()
        }
    }

    @objc func test(_ call: CAPPluginCall) {
        if let appDelegate = UIApplication.shared.delegate as? AppDelegate {
            UNUserNotificationCenter.current().delegate = appDelegate
        }

        let content = UNMutableNotificationContent()
        content.title = "Benza Bullion"
        content.body = "Native iPhone notifications are working on this device."
        content.sound = .default

        let request = UNNotificationRequest(
            identifier: "benza-native-test-\(UUID().uuidString)",
            content: content,
            trigger: UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
        )

        UNUserNotificationCenter.current().add(request) { error in
            if let error {
                call.reject(error.localizedDescription)
            } else {
                call.resolve()
            }
        }
    }
}

@objc(BenzaSmartCameraPlugin)
final class BenzaSmartCameraPlugin: CAPPlugin, CAPBridgedPlugin, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
    let identifier = "BenzaSmartCameraPlugin"
    let jsName = "BenzaSmartCamera"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "scan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "refine", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reset", returnType: CAPPluginReturnPromise)
    ]

    private var pendingCall: CAPPluginCall?
    private var activePicker: UIImagePickerController?
    private var pickerDismissalInProgress = false
    private var resetWaiters: [CAPPluginCall] = []
    private let analysisQueue = DispatchQueue(label: "com.benzabullion.scanner", qos: .userInitiated)
    private let stateLock = NSLock()
    private var generation = 0
    private var activeRequest: VNRecognizeTextRequest?
    private var refinementImage: CGImage?
    private var activeDesignScan: BenzaOfflineScan?
    private var offlineDesignEngine: BenzaOfflineDesignEngine?
    private var analysisInFlight = false
    private var releaseModelsWhenIdle = false

    private let managedAssetPackID = "BenzaPrivateVisionModels"

    private func ensureManagedModelsAvailable() async throws {
        let manager = AssetPackManager.shared

        // Use the iOS 26 managed-asset APIs because Benza Bullion still supports
        // iOS 26.0. The newer manifest API requires iOS 27.
        let pack = try await manager.assetPack(withID: managedAssetPackID)
        try await manager.ensureLocalAvailability(of: pack)

        let requiredPaths: [FilePath] = [
            FilePath("App/PrivateVisionModels/Qwen3VL-2B-Instruct-Q4_K_M.gguf"),
            FilePath("App/PrivateVisionModels/mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf"),
            FilePath("App/PrivateVisionModels/manifest.json")
        ]
        for path in requiredPaths {
            let url = try manager.url(for: path)
            guard FileManager.default.fileExists(atPath: url.path) else {
                throw NSError(
                    domain: "BenzaSmartCamera",
                    code: 1002,
                    userInfo: [NSLocalizedDescriptionKey: "Scanner model download finished, but a required model file is missing."]
                )
            }
        }

        let manifestURL = try manager.url(
            for: FilePath("App/PrivateVisionModels/manifest.json")
        )
        let data = try Data(contentsOf: manifestURL)
        guard let configuration = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              configuration["enabled"] as? Bool == true else {
            throw NSError(
                domain: "BenzaSmartCamera",
                code: 1003,
                userInfo: [NSLocalizedDescriptionKey: "Scanner model pack is present but is not enabled."]
            )
        }
    }

    private func managedModelDirectory() throws -> URL {
        let modelURL = try AssetPackManager.shared.url(
            for: FilePath("App/PrivateVisionModels/Qwen3VL-2B-Instruct-Q4_K_M.gguf")
        )
        return modelURL.deletingLastPathComponent()
    }

    // Advancing the generation invalidates every callback from an older attempt.
    private func advanceGeneration() -> Int {
        stateLock.lock()
        generation += 1
        let value = generation
        let request = activeRequest
        let designScan = activeDesignScan
        activeRequest = nil
        activeDesignScan = nil
        refinementImage = nil
        stateLock.unlock()
        request?.cancel()
        designScan?.cancel()
        return value
    }

    private func currentGeneration() -> Int {
        stateLock.lock()
        defer { stateLock.unlock() }
        return generation
    }

    private func isCurrent(_ value: Int) -> Bool {
        return currentGeneration() == value
    }

    private func activate(_ request: VNRecognizeTextRequest, generation value: Int) -> Bool {
        stateLock.lock()
        defer { stateLock.unlock() }
        guard generation == value else { return false }
        activeRequest = request
        return true
    }

    private func releaseRequest(_ request: VNRecognizeTextRequest) {
        stateLock.lock()
        defer { stateLock.unlock() }
        if activeRequest === request { activeRequest = nil }
    }

    private func isAnalyzing() -> Bool {
        stateLock.lock()
        defer { stateLock.unlock() }
        return analysisInFlight
    }

    private func finishResetWaiters() {
        guard !isAnalyzing() && !pickerDismissalInProgress else { return }
        if releaseModelsWhenIdle {
            // Engine retains verified paths only. Unload model memory while keeping
            // file verification cached for subsequent scans in this app session.
            BenzaOfflineDesignEngine.releaseCachedRuntime()
            releaseModelsWhenIdle = false
        }
        let waiters = resetWaiters
        resetWaiters.removeAll()
        waiters.forEach { $0.resolve() }
    }

    private func dismissPicker(_ picker: UIImagePickerController, completion: @escaping () -> Void) {
        pickerDismissalInProgress = true
        picker.dismiss(animated: true) {
            self.pickerDismissalInProgress = false
            completion()
            self.finishResetWaiters()
        }
    }

    @objc func reset(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if call.getBool("releaseModels") == true {
                self.releaseModelsWhenIdle = true
            }
            _ = self.advanceGeneration()
            let previousCall = self.pendingCall
            self.pendingCall = nil
            let picker = self.activePicker
            self.activePicker = nil
            previousCall?.resolve(["cancelled": true, "lines": []])
            self.resetWaiters.append(call)
            if let picker {
                self.dismissPicker(picker) {}
            } else if !self.pickerDismissalInProgress {
                self.finishResetWaiters()
            }
        }
    }

    @objc func scan(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let source: UIImagePickerController.SourceType = call.getString("source") == "library" ? .photoLibrary : .camera
            guard UIImagePickerController.isSourceTypeAvailable(source) else {
                call.reject("Camera is not available on this device.")
                return
            }
            guard self.pendingCall == nil && !self.pickerDismissalInProgress && !self.isAnalyzing() else {
                call.reject("A Smart Camera scan is already in progress.")
                return
            }
            guard let presenter = self.bridge?.viewController else {
                call.reject("Smart Camera could not open the camera.")
                return
            }

            guard presenter.presentedViewController == nil else {
                call.reject("Close the other screen before opening Smart Camera.")
                return
            }

            let generation = self.advanceGeneration()
            self.pendingCall = call

            Task { @MainActor in
                // Prepare missing assets in the background; OCR/camera do not wait for a download.
                if ProcessInfo.processInfo.physicalMemory >= 7 * 1024 * 1024 * 1024 {
                    Task { try? await self.ensureManagedModelsAvailable() }
                }

                guard self.isCurrent(generation), self.pendingCall != nil else { return }
                guard presenter.presentedViewController == nil else {
                    self.pendingCall = nil
                    call.reject("Close the other screen before opening Smart Camera.")
                    return
                }

                let picker = UIImagePickerController()
                picker.sourceType = source
                if source == .camera { picker.cameraCaptureMode = .photo }
                picker.allowsEditing = false
                picker.delegate = self
                self.activePicker = picker
                picker.modalPresentationStyle = .fullScreen
                presenter.present(picker, animated: true)
            }
        }
    }

    @objc func refine(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.pendingCall == nil && !self.isAnalyzing(),
                  let image = self.refinementImage else {
                call.reject("No completed photo is available to refine.")
                return
            }
            self.pendingCall = call
            self.recognizeText(in: UIImage(cgImage: image), call: call,
                               generation: self.currentGeneration(), fast: false)
        }
    }

    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
        guard activePicker === picker else { return }
        activePicker = nil
        _ = advanceGeneration()
        let call = pendingCall
        pendingCall = nil
        dismissPicker(picker) {
            call?.resolve(["cancelled": true, "lines": []])
        }
    }

    func imagePickerController(_ picker: UIImagePickerController,
                               didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey : Any]) {
        guard activePicker === picker else { return }
        activePicker = nil
        let generation = currentGeneration()
        guard let image = info[.originalImage] as? UIImage else {
            let call = pendingCall
            pendingCall = nil
            dismissPicker(picker) {
                call?.reject("Smart Camera could not read the captured photo.")
            }
            return
        }

        let call = pendingCall
        dismissPicker(picker) {
            self.recognizeText(in: image, call: call, generation: generation)
        }
    }

    // Multiple bounded OCR passes recover rotated rim inscriptions and small dates.
    // No generic image labels or color measurements are used as bullion evidence.
    private func recognizeText(in image: UIImage, call: CAPPluginCall?, generation: Int, fast: Bool = true) {
        guard isCurrent(generation) else { return }
        guard let cgImage = normalizedCGImage(image) else {
            pendingCall = nil
            call?.reject("Smart Camera could not prepare the captured photo.")
            return
        }
        stateLock.lock()
        guard self.generation == generation && !analysisInFlight else {
            stateLock.unlock()
            return
        }
        analysisInFlight = true
        refinementImage = cgImage
        stateLock.unlock()
        analysisQueue.async {
            var completion: (() -> Void)?
            // Reset resolves only after the worker's model/OCR allocations unwind.
            defer {
                let completedCallback = completion
                self.analysisQueue.async {
                    DispatchQueue.main.async {
                        self.stateLock.lock()
                        self.analysisInFlight = false
                        self.stateLock.unlock()
                        completedCallback?()
                        self.finishResetWaiters()
                    }
                }
            }
            guard self.isCurrent(generation) else { return }
            let started = Date()
            let context = CIContext(options: nil)
            let input = CIImage(cgImage: cgImage)
            let extent = input.extent
            // Bullion inscriptions are often tiny, curved around the rim, and low-contrast
            // against reflective metal. Use a bounded set of full-frame and rim-focused
            // views rather than repeatedly OCRing only the center of the coin.
            let enhanced = input
                .applyingFilter("CIColorControls", parameters: [
                    kCIInputSaturationKey: 0,
                    kCIInputContrastKey: 1.7,
                    kCIInputBrightnessKey: 0.04
                ])
                .applyingFilter("CISharpenLuminance", parameters: [
                    kCIInputSharpnessKey: 0.65
                ])
            let center = extent.insetBy(dx: extent.width * 0.08, dy: extent.height * 0.08)
            let bandHeight = extent.height * 0.42
            let bandWidth = extent.width * 0.42
            let top = CGRect(x: extent.minX, y: extent.maxY - bandHeight,
                             width: extent.width, height: bandHeight)
            let bottom = CGRect(x: extent.minX, y: extent.minY,
                                width: extent.width, height: bandHeight)
            let left = CGRect(x: extent.minX, y: extent.minY,
                              width: bandWidth, height: extent.height)
            let right = CGRect(x: extent.maxX - bandWidth, y: extent.minY,
                               width: bandWidth, height: extent.height)

            var passes: [(CGImage, CGImagePropertyOrientation, Bool)] = [(cgImage, .up, true)]
            let rimImages = BenzaCoinRim.readingImages(cgImage, maximumCandidates: fast ? 1 : 3) { !self.isCurrent(generation) }
            passes.append(contentsOf: rimImages.map { ($0, .up, false) })
            func appendPasses(rect: CGRect,
                              orientations: [CGImagePropertyOrientation],
                              correction: Bool = false) {
                guard let crop = context.createCGImage(enhanced, from: rect.intersection(extent)) else { return }
                for orientation in orientations {
                    passes.append((crop, orientation, correction))
                }
            }
            appendPasses(rect: extent, orientations: [.up])
            appendPasses(rect: center, orientations: [.up])
            appendPasses(rect: top, orientations: [.up, .down])
            appendPasses(rect: bottom, orientations: [.up, .down])
            appendPasses(rect: left, orientations: [.right])
            appendPasses(rect: right, orientations: [.left])
            passes.append(contentsOf: [(cgImage, .right, true), (cgImage, .left, true), (cgImage, .down, true)])
            var found: [String: (String, Float)] = [:]
            var completed = 0
            var passReadings: [[String: Any]] = []
            var lastError: Error?
            for (passIndex, pass) in passes.enumerated() {
                let (photo, orientation, correction) = pass
                if !self.isCurrent(generation) || (fast && completed >= 4) || (completed >= 4 && Date().timeIntervalSince(started) > 12) { break }
                autoreleasepool {
                    let request = VNRecognizeTextRequest()
                    request.recognitionLevel = .accurate
                    request.usesLanguageCorrection = correction
                    let supported = (try? request.supportedRecognitionLanguages()) ?? ["en-US"]
                    request.recognitionLanguages = ["en-US", "fr-FR", "es-ES", "de-DE"].filter { supported.contains($0) }
                    // Language detection can recognize inscriptions outside our preferred languages.
                    if #available(iOS 16.0, *) { request.automaticallyDetectsLanguage = true }
                    request.minimumTextHeight = 0.002
                    request.customWords = [
          "FINE SILVER",
          "ARGENT PUR",
          "FINE GOLD",
          "OR PUR",
          "PLATA PURA",
          "ORO PURO",
          "FEINSILBER",
          "FEINGOLD",
          "PLATINUM",
          "PALLADIUM",
          "CANADA",
          "LIBERTY",
          "IN GOD WE TRUST",
          "E PLURIBUS UNUM",
          "UNITED STATES OF AMERICA",
          "ONE DOLLAR",
          "ONE OUNCE",
          "ONE TROY OUNCE",
          "FINE PLATINUM",
          "FINE PALLADIUM",
          "FINE COPPER",
          "American Eagle",
          "American Buffalo",
          "Maple Leaf",
          "Britannia",
          "Queen's Beasts",
          "Krugerrand",
          "Philharmoniker",
          "Kangaroo",
          "Kookaburra",
          "Koala",
          "Panda",
          "Libertad",
          "Noah's Ark",
          "Somali Elephant",
          "Sovereign",
          "Half Sovereign",
          "Swiss 20 Franc",
          "20 Franc",
          "Rooster",
          "Corona",
          "Saint-Gaudens",
          "Liberty Head",
          "Indian Head",
          "Double Eagle",
          "Morgan Dollar",
          "Peace Dollar",
          "Walking Liberty",
          "Franklin",
          "Kennedy",
          "Washington Quarter",
          "Standing Liberty",
          "Barber",
          "Mercury Dime",
          "Roosevelt Dime",
          "PAMP",
          "Valcambi",
          "Argor Heraeus",
          "Engelhard",
          "Johnson Matthey",
          "Scottsdale",
          "Sunshine Mint",
          "Asahi",
          "Geiger",
          "Heraeus",
          "Royal Canadian Mint",
          "Royal Mint",
          "Perth Mint",
          "Austrian Mint",
          "South African Mint",
          "Casa de Moneda",
          "1 OZ",
          "1/2 OZ",
          "1/4 OZ",
          "1/10 OZ",
          "1 TROY OZ",
          "2 OZ",
          "5 OZ",
          "10 OZ",
          "1 GRAM",
          "5 GRAM",
          "10 GRAM",
          "20 GRAM",
          "50 GRAM",
          "100 GRAM",
          "1 KG",
          "9999",
          "9995",
          "999",
          "999.9",
          "9167",
          "900",
          "AUSTRALIA",
          "ONE DIME",
          "QUARTER DOLLAR",
          "HALF DOLLAR",
          "American Gold Eagle",
          "American Gold Buffalo",
          "Canadian Gold Maple Leaf",
          "South African Gold Krugerrand",
          "British Gold Britannia",
          "Austrian Gold Philharmonic",
          "Australian Gold Kangaroo",
          "Australian Gold Lunar",
          "Chinese Gold Panda",
          "Mexican Gold Libertad",
          "Mexican 50 Peso Gold",
          "Mexican 20 Peso Gold",
          "Mexican 10 Peso Gold",
          "Mexican 5 Peso Gold",
          "Mexican 2.5 Peso Gold",
          "British Gold Sovereign",
          "British Gold Half Sovereign",
          "Swiss 20 Franc Gold",
          "French 20 Franc Rooster",
          "Austrian 100 Corona Gold",
          "Austrian 20 Corona Gold",
          "U.S. $20 Saint-Gaudens Double Eagle",
          "U.S. $20 Liberty Head Double Eagle",
          "U.S. $10 Indian Head Eagle",
          "U.S. $10 Liberty Head Eagle",
          "U.S. $5 Indian Head Half Eagle",
          "U.S. $5 Liberty Head Half Eagle",
          "U.S. $2.50 Indian Head Quarter Eagle",
          "U.S. $2.50 Liberty Head Quarter Eagle",
          "Gold Bullion Coin",
          "Gold Bar",
          "Gold Round",
          "American Silver Eagle",
          "Canadian Silver Maple Leaf",
          "British Silver Britannia",
          "British Silver Queen’s Beasts",
          "Austrian Silver Philharmonic",
          "Australian Silver Kangaroo",
          "Australian Silver Kookaburra",
          "Australian Silver Koala",
          "Australian Silver Lunar",
          "Chinese Silver Panda",
          "Mexican Silver Libertad",
          "South African Silver Krugerrand",
          "Armenian Silver Noah’s Ark",
          "Somali Silver Elephant",
          "Morgan Silver Dollar",
          "Peace Silver Dollar",
          "Walking Liberty Half Dollar",
          "Franklin Half Dollar",
          "1964 Kennedy Half Dollar",
          "Washington Silver Quarter",
          "Standing Liberty Quarter",
          "Barber Quarter",
          "Roosevelt Silver Dime",
          "Barber Dime",
          "Barber Half Dollar",
          "U.S. 90% Silver Coinage",
          "Silver Bullion Coin",
          "Silver Bar",
          "Silver Round",
          "American Platinum Eagle",
          "Canadian Platinum Maple Leaf",
          "British Platinum Britannia",
          "Australian Platinum Kangaroo",
          "Austrian Platinum Philharmonic",
          "Isle of Man Platinum Noble",
          "Platinum Bullion Coin",
          "Platinum Bar",
          "Platinum Round",
          "American Palladium Eagle",
          "Canadian Palladium Maple Leaf",
          "Russian Palladium Ballerina",
          "Chinese Palladium Panda",
          "Palladium Bullion Coin",
          "Palladium Bar",
          "Palladium Round",
          "1 oz Copper Round",
          "Copper Bullion Round",
          "Copper Bullion Bar",
          "1 lb Copper Bar",
          "5 lb Copper Bar",
          "10 lb Copper Bar",
          "Copper Bullion Coin",
          "Copper Coin Collection",
          "U.S. Copper Cents"
                    ]
                    guard self.activate(request, generation: generation) else { return }
                    defer { self.releaseRequest(request) }
                    do {
                        try VNImageRequestHandler(cgImage: photo, orientation: orientation, options: [:]).perform([request])
                        completed += 1
                        var observations: [[String: Any]] = []
                        var passConfidence: Float = 0
                        for observation in request.results ?? [] {
                            guard let top = observation.topCandidates(1).first, top.confidence >= 0.25 else { continue }
                            let line = top.string.trimmingCharacters(in: .whitespacesAndNewlines)
                            let key = line.lowercased()
                            if !line.isEmpty {
                                observations.append(["text": line, "confidence": Double(top.confidence)])
                                passConfidence += top.confidence
                            }
                            if !line.isEmpty && top.confidence > (found[key]?.1 ?? 0) {
                                found[key] = (line, top.confidence)
                            }
                        }
                        passReadings.append(["id": passIndex, "observations": observations,
                                             "confidence": observations.isEmpty ? 0 : Double(passConfidence) / Double(observations.count)])
                    } catch { lastError = error }
                }
            }
            context.clearCaches()
            guard self.isCurrent(generation) else { return }
            var designID: String?
            var designStatus = fast ? "ocr-first" : "asset-pack-unavailable"
            let ocrElapsedMs = Int(Date().timeIntervalSince(started) * 1000)
            if !fast { do {
                let directory = try self.managedModelDirectory()
                let manifest = directory.appendingPathComponent("manifest.json")
                var enabled = false
                if let data = try? Data(contentsOf: manifest),
                   let configuration = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] {
                    enabled = configuration["enabled"] as? Bool == true
                }
                if enabled && ProcessInfo.processInfo.physicalMemory >= 7 * 1024 * 1024 * 1024 {
                    do {
                        let scan = try BenzaOfflineScan()
                        self.stateLock.lock()
                        let current = self.generation == generation
                        if current { self.activeDesignScan = scan }
                        self.stateLock.unlock()
                        guard current else { scan.cancel(); return }
                        defer {
                            self.stateLock.lock()
                            if self.activeDesignScan === scan { self.activeDesignScan = nil }
                            self.stateLock.unlock()
                        }
                        if self.offlineDesignEngine == nil {
                            self.offlineDesignEngine = try BenzaOfflineDesignEngine(directory: directory)
                        }
                        guard let engine = self.offlineDesignEngine else {
                            throw BenzaOfflineDesignEngine.Failure.unavailable
                        }
                        let identity = try autoreleasepool {
                            try engine.identify(image: cgImage, scan: scan)
                        }
                        designStatus = "local-catalogue-v1"
                        if identity.design != .unknown { designID = identity.design.rawValue }
                    } catch {
                        designStatus = "unavailable"
                    }
                } else if enabled {
                    designStatus = "device-limited"
                }
            } catch {
                // OCR remains available if the essential pack is temporarily unavailable.
                designStatus = "asset-pack-unavailable"
            }
            }
            guard self.isCurrent(generation) else { return }
            let readings = found.values.sorted { $0.1 > $1.1 }
            let lines = readings.map { $0.0 }
            let confidence = readings.isEmpty ? 0 : Double(readings.reduce(Float(0)) { $0 + $1.1 }) / Double(readings.count)
            completion = {
                guard self.isCurrent(generation) else { return }
                self.pendingCall = nil
                if completed == 0 && designID == nil {
                    call?.reject(lastError?.localizedDescription ?? "Could not read this photo. Please try again.")
                } else {
                    var response: [String: Any] = ["cancelled": false, "lines": lines,
                                   "text": lines.joined(separator: "\n"), "confidence": confidence,
                                   "ocrPasses": completed, "passes": passReadings, "engineVersion": 5,
                                   "ocrElapsedMs": ocrElapsedMs, "rimPasses": rimImages.count,
                                   "designStatus": designStatus,
                                   "elapsedMs": Int(Date().timeIntervalSince(started) * 1000),
                                   "appBuild": Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "unknown"]
                    if let designID {
                        response["designSuggestion"] = ["id": designID, "source": "local-catalogue-v1"]
                    }
                    if let photoBase64 = self.scannerArchiveBase64(from: cgImage) {
                        response["capturedPhotoBase64"] = photoBase64
                        response["capturedPhotoMime"] = "image/jpeg"
                    }
                    call?.resolve(response)
                }
            }
        }
    }

    private func scannerArchiveBase64(from cgImage: CGImage) -> String? {
        let longest = CGFloat(max(cgImage.width, cgImage.height))
        guard longest > 0 else { return nil }
        let scale = min(1, 1400 / longest)
        let size = CGSize(width: CGFloat(cgImage.width) * scale,
                          height: CGFloat(cgImage.height) * scale)
        UIGraphicsBeginImageContextWithOptions(size, false, 1)
        defer { UIGraphicsEndImageContext() }
        UIImage(cgImage: cgImage).draw(in: CGRect(origin: .zero, size: size))
        guard let image = UIGraphicsGetImageFromCurrentImageContext(),
              let data = image.jpegData(compressionQuality: 0.80),
              data.count <= 4 * 1024 * 1024 else { return nil }
        return data.base64EncodedString()
    }

    private func normalizedCGImage(_ image: UIImage) -> CGImage? {
        // Bound memory and OCR latency; apply UIImage orientation before Vision.
        let longest = max(image.size.width, image.size.height)
        guard longest > 0 else { return nil }
        let ratio = min(1, 2200 / longest)
        let size = CGSize(width: image.size.width * ratio, height: image.size.height * ratio)
        UIGraphicsBeginImageContextWithOptions(size, false, 1)
        defer { UIGraphicsEndImageContext() }
        image.draw(in: CGRect(origin: .zero, size: size))
        return UIGraphicsGetImageFromCurrentImageContext()?.cgImage
    }

}

@objc(BenzaStoreKitPlugin)
final class BenzaStoreKitPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "BenzaStoreKitPlugin"
    let jsName = "BenzaStoreKit"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPendingTransactions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restorePurchases", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finishTransaction", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "manageSubscriptions", returnType: CAPPluginReturnPromise)
    ]

    private let allowedProducts: Set<String> = [
        "benza_pro_monthly",
        "benza_pro_annual",
        "benza_pro_founder_lifetime"
    ]

    private var transactionUpdatesTask: Task<Void, Never>?

    override func load() {
        transactionUpdatesTask = Task { @MainActor [weak self] in
            for await verification in Transaction.updates {
                guard !Task.isCancelled else { return }
                guard let self, case .verified(let transaction) = verification,
                      self.allowedProducts.contains(transaction.productID) else { continue }
                self.notifyListeners("transactionUpdated", data: [
                    "productId": transaction.productID,
                    "transactionId": String(transaction.id),
                    "appAccountToken": transaction.appAccountToken?.uuidString.lowercased() ?? "",
                    "revoked": transaction.revocationDate != nil,
                    "signedTransaction": verification.jwsRepresentation
                ], retainUntilConsumed: true)
            }
        }
    }

    deinit { transactionUpdatesTask?.cancel() }

    @objc func getProducts(_ call: CAPPluginCall) {
        Task { @MainActor in
            do {
                var result: [[String: Any]] = []
                for product in try await Product.products(for: Array(allowedProducts)) {
                    var row: [String: Any] = ["productId": product.id, "displayPrice": product.displayPrice]
                    if let subscription = product.subscription,
                       await subscription.isEligibleForIntroOffer,
                       let offer = subscription.introductoryOffer, offer.paymentMode == .freeTrial {
                        let unit: String
                        switch offer.period.unit {
                        case .day: unit = "day"
                        case .week: unit = "week"
                        case .month: unit = "month"
                        case .year: unit = "year"
                        @unknown default: unit = ""
                        }
                        if !unit.isEmpty {
                            row["trialUnit"] = unit
                            row["trialValue"] = offer.period.value * offer.periodCount
                        }
                    }
                    result.append(row)
                }
                call.resolve(["products": result])
            } catch { call.reject(error.localizedDescription) }
        }
    }

    @objc func getPendingTransactions(_ call: CAPPluginCall) {
        guard let token = call.getString("appAccountToken").flatMap(UUID.init(uuidString:)) else {
            call.reject("A signed-in account is required.")
            return
        }
        Task { @MainActor in
            var result: [[String: Any]] = []
            for await verification in Transaction.unfinished {
                guard case .verified(let transaction) = verification,
                      allowedProducts.contains(transaction.productID), transaction.appAccountToken == token,
                      transaction.revocationDate == nil else { continue }
                result.append(["productId": transaction.productID, "transactionId": String(transaction.id),
                               "appAccountToken": token.uuidString.lowercased(), "signedTransaction": verification.jwsRepresentation])
            }
            call.resolve(["transactions": result])
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId"), allowedProducts.contains(productId) else {
            call.reject("Unknown Benza Bullion product.")
            return
        }

        guard let accountToken = call.getString("appAccountToken").flatMap(UUID.init(uuidString:)) else {
            call.reject("A signed-in account is required.")
            return
        }

        Task { @MainActor in
            do {
                guard let product = try await Product.products(for: [productId]).first else {
                    call.reject("This App Store product is not available yet.")
                    return
                }

                let result: Product.PurchaseResult
                result = try await product.purchase(options: [.appAccountToken(accountToken)])

                switch result {
                case .success(let verification):
                    guard case .verified(let transaction) = verification else {
                        call.reject("Apple could not verify this purchase.")
                        return
                    }
                    call.resolve([
                        "state": "purchased",
                        "productId": transaction.productID,
                        "transactionId": String(transaction.id),
                        "signedTransaction": verification.jwsRepresentation
                    ])
                case .pending:
                    call.resolve(["state": "pending", "productId": productId])
                case .userCancelled:
                    call.resolve(["state": "cancelled", "productId": productId])
                @unknown default:
                    call.reject("Unknown App Store purchase result.")
                }
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func restorePurchases(_ call: CAPPluginCall) {
        Task { @MainActor in
            // Only a user-initiated restore may prompt for Apple authentication.
            // Refresh before enumerating receipts, especially after sandbox
            // account changes. Do not verify cached receipts if syncing fails.
            if call.getBool("sync", false) {
                do {
                    try await AppStore.sync()
                } catch {
                    call.reject("Apple could not refresh purchases. Please try Restore Purchases again. \(error.localizedDescription)")
                    return
                }
            }

            var restored: [[String: Any]] = []

            for await verification in Transaction.currentEntitlements {
                guard case .verified(let transaction) = verification,
                      allowedProducts.contains(transaction.productID),
                      transaction.revocationDate == nil else { continue }

                restored.append([
                    "productId": transaction.productID,
                    "transactionId": String(transaction.id),
                    "signedTransaction": verification.jwsRepresentation
                ])
            }

            call.resolve(["transactions": restored])
        }
    }

    @objc func finishTransaction(_ call: CAPPluginCall) {
        guard let transactionId = call.getString("transactionId"),
              let targetId = UInt64(transactionId) else {
            call.resolve()
            return
        }

        Task {
            for await verification in Transaction.unfinished {
                guard case .verified(let transaction) = verification else { continue }
                if transaction.id == targetId {
                    await transaction.finish()
                    break
                }
            }
            call.resolve()
        }
    }

    @objc func manageSubscriptions(_ call: CAPPluginCall) {
        Task { @MainActor in
            do {
                guard let windowScene = bridge?.viewController?.view.window?.windowScene else {
                    call.reject("Could not open Apple subscription management.")
                    return
                }
                try await AppStore.showManageSubscriptions(in: windowScene)
                call.resolve()
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }
}

final class BenzaBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(BenzaStoreKitPlugin())
        bridge?.registerPluginInstance(BenzaExportPlugin())
        bridge?.registerPluginInstance(BenzaNotificationsPlugin())
        bridge?.registerPluginInstance(BenzaSmartCameraPlugin())
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = BenzaBridgeViewController()
        window?.makeKeyAndVisible()

        if let appDelegate = UIApplication.shared.delegate as? AppDelegate {
            UNUserNotificationCenter.current().delegate = appDelegate
        }

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
