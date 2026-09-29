import UIKit
import Capacitor
import StoreKit
import UserNotifications
import Vision

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
        CAPPluginMethod(name: "scan", returnType: CAPPluginReturnPromise)
    ]

    private var pendingCall: CAPPluginCall?

    @objc func scan(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
                call.reject("Camera is not available on this device.")
                return
            }
            guard self.pendingCall == nil else {
                call.reject("A Smart Camera scan is already in progress.")
                return
            }
            guard let presenter = self.bridge?.viewController else {
                call.reject("Smart Camera could not open the camera.")
                return
            }

            self.pendingCall = call
            let picker = UIImagePickerController()
            picker.sourceType = .camera
            picker.cameraCaptureMode = .photo
            picker.allowsEditing = false
            picker.delegate = self
            picker.modalPresentationStyle = .fullScreen
            presenter.present(picker, animated: true)
        }
    }

    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
        let call = pendingCall
        pendingCall = nil
        picker.dismiss(animated: true) {
            call?.resolve(["cancelled": true, "lines": []])
        }
    }

    func imagePickerController(_ picker: UIImagePickerController,
                               didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey : Any]) {
        guard let image = info[.originalImage] as? UIImage else {
            let call = pendingCall
            pendingCall = nil
            picker.dismiss(animated: true) {
                call?.reject("Smart Camera could not read the captured photo.")
            }
            return
        }

        let call = pendingCall
        pendingCall = nil
        picker.dismiss(animated: true) {
            self.recognizeText(in: image, call: call)
        }
    }

    private func recognizeText(in image: UIImage, call: CAPPluginCall?) {
        guard let cgImage = normalizedCGImage(image) else {
            call?.reject("Smart Camera could not prepare the captured photo.")
            return
        }

        DispatchQueue.global(qos: .userInitiated).async {
            let request = VNRecognizeTextRequest { request, error in
                if let error {
                    DispatchQueue.main.async { call?.reject(error.localizedDescription) }
                    return
                }

                let observations = request.results as? [VNRecognizedTextObservation] ?? []
                let candidates = observations.compactMap { observation -> (String, Float)? in
                    guard let top = observation.topCandidates(1).first else { return nil }
                    let text = top.string.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !text.isEmpty else { return nil }
                    return (text, top.confidence)
                }
                .sorted { $0.1 > $1.1 }

                let lines = candidates.map { $0.0 }
                let avgConfidence = candidates.isEmpty
                    ? 0
                    : Double(candidates.reduce(Float(0)) { $0 + $1.1 }) / Double(candidates.count)

                DispatchQueue.main.async {
                    call?.resolve([
                        "cancelled": false,
                        "lines": lines,
                        "text": lines.joined(separator: "\n"),
                        "confidence": avgConfidence
                    ])
                }
            }

            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = true
            request.recognitionLanguages = ["en-US"]

            do {
                try VNImageRequestHandler(cgImage: cgImage, options: [:]).perform([request])
            } catch {
                DispatchQueue.main.async { call?.reject(error.localizedDescription) }
            }
        }
    }

    private func normalizedCGImage(_ image: UIImage) -> CGImage? {
        if image.imageOrientation == .up, let cg = image.cgImage {
            return cg
        }
        UIGraphicsBeginImageContextWithOptions(image.size, false, 1)
        image.draw(in: CGRect(origin: .zero, size: image.size))
        let normalized = UIGraphicsGetImageFromCurrentImageContext()
        UIGraphicsEndImageContext()
        return normalized?.cgImage
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
