import UIKit
import Capacitor
import StoreKit

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
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = BenzaBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
