import UIKit
import Capacitor
import StoreKit
import UserNotifications
import Vision
import CoreImage
import ImageIO
import BenzaPrivateVision

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
    private var activeDesignScan: BenzaOfflineScan?
    private var offlineDesignEngine: BenzaOfflineDesignEngine?
    private var analysisInFlight = false

    // Advancing the generation invalidates every callback from an older attempt.
    private func advanceGeneration() -> Int {
        stateLock.lock()
        generation += 1
        let value = generation
        let request = activeRequest
        let designScan = activeDesignScan
        activeRequest = nil
        activeDesignScan = nil
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
            _ = self.advanceGeneration()
            self.pendingCall = call
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
    private func recognizeText(in image: UIImage, call: CAPPluginCall?, generation: Int) {
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
            let contrast = input.applyingFilter("CIColorControls", parameters: [
                kCIInputSaturationKey: 0, kCIInputContrastKey: 1.35
            ])
            let center = extent.insetBy(dx: extent.width * 0.12, dy: extent.height * 0.12)
            let bottom = CGRect(x: extent.minX, y: extent.minY,
                                width: extent.width, height: extent.height * 0.42)
            var passes: [(CGImage, CGImagePropertyOrientation, Bool)] = [
                (cgImage, .up, true), (cgImage, .right, true),
                (cgImage, .left, true), (cgImage, .down, true)
            ]
            if let enhanced = context.createCGImage(contrast, from: extent) {
                passes.append((enhanced, .up, false))
            }
            if let crop = context.createCGImage(contrast, from: center) {
                passes.append(contentsOf: [(crop, .up, true), (crop, .right, true),
                                           (crop, .left, true), (crop, .down, true)])
            }
            if let dateCrop = context.createCGImage(contrast, from: bottom) {
                passes.insert((dateCrop, .up, false), at: 1)
            }
            var found: [String: (String, Float)] = [:]
            var completed = 0
            var passReadings: [[String: Any]] = []
            var lastError: Error?
            for (passIndex, pass) in passes.enumerated() {
                let (photo, orientation, correction) = pass
                if !self.isCurrent(generation) || (completed > 0 && Date().timeIntervalSince(started) > 18) { break }
                autoreleasepool {
                    let request = VNRecognizeTextRequest()
                    request.recognitionLevel = .accurate
                    request.usesLanguageCorrection = correction
                    let supported = (try? request.supportedRecognitionLanguages()) ?? ["en-US"]
                    request.recognitionLanguages = ["en-US", "fr-FR", "es-ES", "de-DE"].filter { supported.contains($0) }
                    request.minimumTextHeight = 0.004
                    request.customWords = [
                        "FINE SILVER", "ARGENT PUR", "FINE GOLD", "OR PUR", "PLATA PURA",
                        "ORO PURO", "FEINSILBER", "FEINGOLD", "PLATINUM", "PALLADIUM",
                        "CANADA", "LIBERTY", "IN GOD WE TRUST", "ONE DOLLAR", "ONE OUNCE",
                        "American Eagle", "Maple Leaf", "Britannia", "Krugerrand",
                        "Philharmoniker", "Kangaroo", "Kookaburra", "Koala", "Panda",
                        "Libertad", "PAMP", "Valcambi", "Engelhard", "Johnson Matthey",
                        "1 OZ", "1 TROY OZ", "9999", "9995", "999", "999.9"
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
            var designStatus = "not-bundled"
            if let resources = Bundle.main.resourceURL {
                let directory = resources.appendingPathComponent("PrivateVisionModels")
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
                        guard let engine = self.offlineDesignEngine else { throw BenzaOfflineDesignEngine.Failure.unavailable }
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
                                   "ocrPasses": completed, "passes": passReadings, "engineVersion": 4,
                                   "designStatus": designStatus,
                                   "elapsedMs": Int(Date().timeIntervalSince(started) * 1000),
                                   "appBuild": Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "unknown"]
                    if let designID {
                        response["designSuggestion"] = ["id": designID, "source": "local-catalogue-v1"]
                    }
                    call?.resolve(response)
                }
            }
        }
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

    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId"), allowedProducts.contains(productId) else {
            call.reject("Unknown Benza Bullion product.")
            return
        }

        let accountToken = call.getString("appAccountToken").flatMap(UUID.init(uuidString:))

        Task { @MainActor in
            do {
                guard let product = try await Product.products(for: [productId]).first else {
                    call.reject("This App Store product is not available yet.")
                    return
                }

                let result: Product.PurchaseResult
                if let accountToken {
                    result = try await product.purchase(options: [.appAccountToken(accountToken)])
                } else {
                    result = try await product.purchase()
                }

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

            // On the same TestFlight device, currentEntitlements already contains
            // completed sandbox purchases. Avoid forcing AppStore.sync(), which can
            // surface a generic "Unable to Complete Request" sandbox error.
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
