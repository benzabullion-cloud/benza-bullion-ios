import UIKit
import Capacitor
import UserNotifications

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Re-assert Benza Bullion as the notification-center delegate whenever
        // the app becomes active so foreground APNs alerts can present banners.
        UNUserNotificationCenter.current().delegate = self
        scheduleFounderLaunchValueCopy()
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }

    private func scheduleFounderLaunchValueCopy() {
        // Keep Apple/StoreKit as the single source of truth for the actual purchase
        // price. This additional line only communicates the planned post-Founder
        // lifetime price and the resulting Founder savings.
        for delay in [0.8, 1.8, 3.0] {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                self?.injectFounderLaunchValueCopy()
            }
        }
    }

    private func injectFounderLaunchValueCopy() {
        let activeScene = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }
        guard let root = activeScene?.windows.first(where: { $0.isKeyWindow })?.rootViewController,
              let bridge = findBridgeController(from: root),
              let webView = bridge.webView else { return }

        let script = #"""
        (() => {
          const copy = 'Future lifetime price: $74.99 · Founder savings: $49.99';
          const install = () => {
            document.querySelectorAll('#proPlanFounder, .settingsFounderPrice').forEach(card => {
              let value = card.querySelector('.founderFutureValue');
              if (!value) {
                value = document.createElement('span');
                value.className = 'founderFutureValue';
                value.style.display = 'block';
                value.style.marginTop = '6px';
                value.style.color = '#d6a53a';
                value.style.fontSize = '9px';
                value.style.fontWeight = '900';
                value.style.lineHeight = '1.35';
                value.style.letterSpacing = '.12px';
                const badge = card.querySelector('.founderBadgeBonus');
                if (badge) card.insertBefore(value, badge);
                else card.appendChild(value);
              }
              value.textContent = copy;
            });
          };
          install();
          if (!window.__benzaFounderValueObserver) {
            window.__benzaFounderValueObserver = new MutationObserver(install);
            window.__benzaFounderValueObserver.observe(document.documentElement, {childList:true, subtree:true});
          }
        })();
        """#
        webView.evaluateJavaScript(script, completionHandler: nil)
    }

    private func findBridgeController(from controller: UIViewController) -> CAPBridgeViewController? {
        if let bridge = controller as? CAPBridgeViewController { return bridge }
        if let navigation = controller as? UINavigationController {
            for child in navigation.viewControllers {
                if let bridge = findBridgeController(from: child) { return bridge }
            }
        }
        if let tab = controller as? UITabBarController {
            for child in tab.viewControllers ?? [] {
                if let bridge = findBridgeController(from: child) { return bridge }
            }
        }
        for child in controller.children {
            if let bridge = findBridgeController(from: child) { return bridge }
        }
        if let presented = controller.presentedViewController {
            return findBridgeController(from: presented)
        }
        return nil
    }
}


extension AppDelegate: UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        UserDefaults.standard.set(token, forKey: "benza.apnsToken")
        UserDefaults.standard.removeObject(forKey: "benza.apnsRegistrationError")
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        UserDefaults.standard.set(error.localizedDescription, forKey: "benza.apnsRegistrationError")
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound, .badge])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        completionHandler()
    }
}
