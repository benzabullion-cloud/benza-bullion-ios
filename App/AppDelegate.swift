import UIKit
import Capacitor
import UserNotifications

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    private var uiPolishRetryCount = 0
    private var uiPolishInstalled = false

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {}
    func applicationDidEnterBackground(_ application: UIApplication) {}
    func applicationWillEnterForeground(_ application: UIApplication) {}

    func applicationDidBecomeActive(_ application: UIApplication) {
        UNUserNotificationCenter.current().delegate = self
        uiPolishRetryCount = 0
        uiPolishInstalled = false
        installBenzaUIPolishWhenReady()
    }

    func applicationWillTerminate(_ application: UIApplication) {}

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options connectionOptions: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }

    private func installBenzaUIPolishWhenReady() {
        guard !uiPolishInstalled, uiPolishRetryCount < 120 else { return }
        uiPolishRetryCount += 1

        let activeScene = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }

        guard let root = activeScene?.windows.first(where: { $0.isKeyWindow })?.rootViewController,
              let bridge = findBridgeController(from: root),
              let webView = bridge.webView else {
            retryBenzaUIPolish()
            return
        }

        let script = #"""
        (() => {
          if (!document || !document.body || !document.documentElement) return false;
          if (typeof window.requestAccountAccess !== 'function') return false;
          if (!document.querySelector('.guestBrowseTools')) return false;

          const ensureStyles = () => {
            if (document.getElementById('benzaGuestPolishStyle')) return;
            const style = document.createElement('style');
            style.id = 'benzaGuestPolishStyle';
            style.textContent = `
              .founderFutureValue{display:block;margin-top:6px;color:var(--gold,#c88719);font-size:9px;font-weight:900;line-height:1.35;letter-spacing:.12px}
              .guestBrowseTools.benzaGuestCard{position:relative;overflow:hidden;border:1px solid var(--border);border-radius:18px;background:linear-gradient(145deg,var(--surface2),var(--surface));padding:16px;margin-bottom:18px;box-shadow:0 10px 28px var(--shadow)}
              .guestBrowseTools.benzaGuestCard:before{content:'';position:absolute;inset:0 auto auto 0;width:100%;height:2px;background:linear-gradient(90deg,transparent,var(--gold,#c88719),transparent);opacity:.9}
              .benzaGuestEyebrow{font-size:10px;font-weight:900;letter-spacing:1.35px;color:var(--gold,#c88719);margin-bottom:7px}
              .benzaGuestTitle{font-size:18px;font-weight:900;letter-spacing:-.25px;color:var(--text);margin:0 0 5px}
              .benzaGuestCopy{font-size:12.5px!important;line-height:1.48;color:var(--muted)!important;margin:0!important}
              .benzaGuestIncluded{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0}
              .benzaGuestIncluded span{font-size:10px;font-weight:800;color:var(--text);background:var(--surface);border:1px solid var(--border);border-radius:999px;padding:6px 8px;white-space:nowrap}
              .benzaGuestUnlock{font-size:11.5px;line-height:1.45;color:var(--muted);border-top:1px solid var(--border);padding-top:11px;margin-top:2px}
              .benzaGuestUnlock strong{color:var(--text)}
              .guestBrowseTools.benzaGuestCard .guestBrowseActions{margin-top:12px;display:grid;grid-template-columns:1.35fr 1fr;gap:8px}
              .guestBrowseTools.benzaGuestCard .guestBrowseActions button{min-height:43px;border-radius:12px;font-size:12px;font-weight:850}
              .guestBrowseTools.benzaGuestCard .benzaGuestPrimary{border-color:var(--gold,#c88719);background:var(--gold,#c88719);color:#111}
              .guestBrowseTools.benzaGuestCard .benzaGuestSecondary{border:1px solid var(--border);background:var(--surface);color:var(--text)}
              .guestBrowseTools.benzaGuestCard .guestBrowseLinks{margin-top:10px;gap:14px;font-size:10px}
              #benzaGuestLockOverlay{display:none;position:fixed;inset:0;z-index:2147483646;background:var(--overlay);backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);align-items:flex-end;justify-content:center;padding:16px}
              #benzaGuestLockOverlay.show{display:flex}
              #benzaGuestLockCard{width:100%;max-width:410px;background:var(--surface);border:1px solid var(--border);border-radius:22px;padding:20px 18px calc(18px + env(safe-area-inset-bottom));box-shadow:0 26px 70px #0006;animation:benzaGuestRise .22s ease-out}
              @keyframes benzaGuestRise{from{transform:translateY(22px);opacity:.4}to{transform:translateY(0);opacity:1}}
              .benzaGuestLockIcon{width:46px;height:46px;border-radius:15px;display:grid;place-items:center;margin-bottom:13px;background:var(--surface2);border:1px solid var(--border);font-size:21px;color:var(--gold,#c88719)}
              .benzaGuestLockEyebrow{font-size:10px;font-weight:900;letter-spacing:1.25px;color:var(--gold,#c88719);margin-bottom:5px}
              .benzaGuestLockTitle{font-size:21px;font-weight:900;letter-spacing:-.35px;color:var(--text);margin:0 0 7px}
              .benzaGuestLockCopy{font-size:13px;line-height:1.5;color:var(--muted);margin:0 0 14px}
              .benzaGuestLockBenefits{display:grid;gap:8px;margin:0 0 16px}
              .benzaGuestLockBenefit{display:flex;gap:9px;align-items:flex-start;font-size:12px;line-height:1.4;color:var(--text)}
              .benzaGuestLockBenefit i{font-style:normal;color:var(--gold,#c88719);font-weight:900}
              .benzaGuestLockActions{display:grid;gap:8px}
              .benzaGuestLockActions button{width:100%;min-height:47px;border-radius:13px;font-size:14px;font-weight:850}
              .benzaGuestLockCreate{border:1px solid var(--gold,#c88719);background:var(--gold,#c88719);color:#111}
              .benzaGuestLockSignIn{border:1px solid var(--border);background:var(--surface2);color:var(--text)}
              .benzaGuestLockLater{border:0;background:transparent;color:var(--muted);min-height:38px!important}
            `;
            document.head.appendChild(style);
          };

          const installFounderValue = () => {
            const copy = 'Future lifetime price: $74.99 · Founder savings: $49.99';
            document.querySelectorAll('#proPlanFounder, .settingsFounderPrice').forEach(card => {
              let value = card.querySelector('.founderFutureValue');
              if (!value) {
                value = document.createElement('span');
                value.className = 'founderFutureValue';
                const badge = card.querySelector('.founderBadgeBonus');
                if (badge) card.insertBefore(value, badge); else card.appendChild(value);
              }
              value.textContent = copy;
            });
          };

          const polishGuestCards = () => {
            document.querySelectorAll('.guestBrowseTools').forEach(card => {
              if (card.dataset.benzaGuestPolished === '1') return;
              card.dataset.benzaGuestPolished = '1';
              card.classList.add('benzaGuestCard');
              card.innerHTML = `
                <div class="benzaGuestEyebrow">GUEST PREVIEW</div>
                <div class="benzaGuestTitle">Explore Benza Bullion</div>
                <p class="benzaGuestCopy">See what the bullion market is doing before you create an account. These tools stay open while you browse.</p>
                <div class="benzaGuestIncluded"><span>✓ Live Markets</span><span>✓ Calculator</span><span>✓ Market Insights</span></div>
                <div class="benzaGuestUnlock"><strong>Want the full experience?</strong> A free account unlocks your personal bullion portfolio, saved holdings, watchlist and portfolio analytics.</div>
                <div class="guestBrowseActions"><button class="benzaGuestPrimary" type="button" onclick="showGuestAccountSheet('build and save your personal bullion portfolio','portfolio')">Create free account</button><button class="benzaGuestSecondary" type="button" onclick="openProUpgrade()">Explore Pro</button></div>
                <div class="guestBrowseLinks"><a href="privacy.html">Privacy</a><a href="terms.html">Terms</a><a href="support.html">Support</a></div>
              `;
            });
          };

          const ensureGuestSheet = () => {
            let overlay = document.getElementById('benzaGuestLockOverlay');
            if (overlay) return overlay;
            overlay = document.createElement('div');
            overlay.id = 'benzaGuestLockOverlay';
            overlay.setAttribute('role','dialog');
            overlay.setAttribute('aria-modal','true');
            overlay.innerHTML = `<div id="benzaGuestLockCard"><div class="benzaGuestLockIcon">✦</div><div class="benzaGuestLockEyebrow">FULL BENZA BULLION EXPERIENCE</div><h2 class="benzaGuestLockTitle">Make this portfolio yours</h2><p class="benzaGuestLockCopy" id="benzaGuestLockCopy">Create a free account to save your bullion and unlock your personal portfolio.</p><div class="benzaGuestLockBenefits"><div class="benzaGuestLockBenefit"><i>✓</i><span>Track your own gold, silver, platinum, palladium and copper holdings</span></div><div class="benzaGuestLockBenefit"><i>✓</i><span>Save watchlists and build portfolio history over time</span></div><div class="benzaGuestLockBenefit"><i>✓</i><span>Unlock personal analytics and keep your data synced securely</span></div></div><div class="benzaGuestLockActions"><button class="benzaGuestLockCreate" type="button" onclick="openGuestAuth('signup')">Create free account</button><button class="benzaGuestLockSignIn" type="button" onclick="openGuestAuth('login')">Already have an account? Sign in</button><button class="benzaGuestLockLater" type="button" onclick="closeGuestAccountSheet()">Keep exploring</button></div></div>`;
            overlay.addEventListener('click', event => { if (event.target === overlay) window.closeGuestAccountSheet(); });
            document.body.appendChild(overlay);
            return overlay;
          };

          window.closeGuestAccountSheet = function() {
            document.getElementById('benzaGuestLockOverlay')?.classList.remove('show');
          };

          window.openGuestAuth = function(mode='login') {
            window.closeGuestAccountSheet();
            if (typeof setAuthMode === 'function') setAuthMode(mode === 'signup' ? 'signup' : 'login');
            const screen = document.getElementById('authScreen');
            if (screen) screen.style.display = 'flex';
            const status = document.getElementById('authStatus');
            if (status) status.textContent = mode === 'signup'
              ? 'Create your free account to save your portfolio and continue where you left off.'
              : 'Sign in to continue where you left off.';
          };

          window.showGuestAccountSheet = function(reason='use your personal portfolio', route='portfolio') {
            if (window.currentUser) return true;
            window.pendingAccountRoute = route;
            const normalized = String(reason || '').replace(/^to\s+/i,'').replace(/\.$/,'');
            const overlay = ensureGuestSheet();
            const copy = document.getElementById('benzaGuestLockCopy');
            if (copy) copy.textContent = 'Create a free account to ' + normalized + '. Your guest market browsing stays available.';
            overlay.classList.add('show');
            return false;
          };

          if (!window.__benzaOriginalRequestAccountAccess) {
            window.__benzaOriginalRequestAccountAccess = window.requestAccountAccess;
          }
          window.requestAccountAccess = function(reason='use your personal portfolio', route='portfolio') {
            if (window.currentUser) return true;
            if (window.guestBrowsing) return window.showGuestAccountSheet(reason, route);
            return window.__benzaOriginalRequestAccountAccess(reason, route);
          };

          const installAll = () => {
            ensureStyles();
            installFounderValue();
            polishGuestCards();
            ensureGuestSheet();
          };

          installAll();
          if (!window.__benzaUIPolishObserver) {
            window.__benzaUIPolishObserver = new MutationObserver(installAll);
            window.__benzaUIPolishObserver.observe(document.documentElement, {childList:true, subtree:true});
          }

          window.__benzaUIPolishInstalled = true;
          return document.querySelectorAll('.guestBrowseTools.benzaGuestCard').length > 0
            && !!document.getElementById('benzaGuestLockOverlay');
        })();
        """#

        webView.evaluateJavaScript(script) { [weak self] result, error in
            guard let self else { return }
            if error == nil, (result as? Bool) == true {
                self.uiPolishInstalled = true
            } else {
                self.retryBenzaUIPolish()
            }
        }
    }

    private func retryBenzaUIPolish() {
        guard !uiPolishInstalled, uiPolishRetryCount < 120 else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            self?.installBenzaUIPolishWhenReady()
        }
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
