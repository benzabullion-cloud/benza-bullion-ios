# Apple, Google and Password AutoFill (iPhone)

This branch prepares Apple and Google sign-in through the iPhone system
authentication session. Both buttons are hidden unless the signed build sets
`BenzaSocialSignInEnabled` to true in App/Info.plist. Leave it false for production
until the release gates below pass. Browser email sign-in and password recovery
use their existing Supabase client; social sign-in uses a separate in-memory
PKCE flow, then hands the Supabase session to the existing account flow.

## Password AutoFill

- Publish the contents of `docs/password-autofill/apple-app-site-association`
  at `https://benzabullion.com/.well-known/apple-app-site-association` on the
  website's hosting project. Serve the exact path over HTTPS with
  `Content-Type: application/json` and no redirect. If an association file
  already exists when deploying, merge the webcredentials entry.
- Enable Associated Domains for the iOS App ID and update the signing
  profile used by CI if needed. The app entitlement requests
  `webcredentials:benzabullion.com`. Confirm that the signed build includes it
  and that the app identifier prefix in its profile matches the association file.
- Install a fresh signed build on an iPhone, save a Benza Bullion credential
  in Passwords, and tap the email field with AutoFill enabled. Test more
  than one saved account, the password field, and an iPhone with no saved
  credentials. iOS decides which suggestions appear and may require
  opening Passwords. The app does not read or keep a history of saved logins.

## Social sign-in release gates

1. In the intended Supabase project, add the exact redirect
   `com.benzabullion.app.auth://oauth/callback` to the allowlist. Use the
   provider callback shown in Supabase for Google and Apple configuration.
   Configure the OAuth consent screen and test accounts in Google Cloud.
2. Configure Apple's App ID, Services ID, return URL and signing key for the
   hosted Apple flow. Store secrets in provider or server configuration only.
   Track rotation of the Apple client secret before its six-month expiry.
3. Account deletion now asks Apple-linked users to verify their Apple Account
   in a separate in-memory OAuth session. The returned Supabase user ID must
   match the active account. The server refreshes the Apple token, verifies the
   signed Apple ID token against Apple's JWKS and the linked immutable subject,
   then revokes the refresh token before removing any data. Cancellation or
   failed verification/revocation stops deletion. No provider tokens are stored.
   Configure server-only `BENZA_APPLE_CLIENT_ID`, `BENZA_APPLE_TEAM_ID`,
   `BENZA_APPLE_KEY_ID`, and `BENZA_APPLE_PRIVATE_KEY` before deploying.
   Test the actual hosted Apple refresh-token response and deletion with a
   disposable account in TestFlight before enabling the public release.
4. Enable the app flag in a test build only. Test first sign-in, cancellation,
   network errors, sign-out, relaunch, guest browsing, and password recovery.
   Test existing verified-email accounts with holdings and Pro purchases:
   verify the Supabase user ID, holdings and entitlement before and after
   sign-in. Test Apple's Hide My Email separately; relay addresses may
   create a separate account. Do not automatically merge accounts or move
   purchases by email. Existing users should continue with their original
   login until same-account access is confirmed.
5. Recheck App Review guideline 4.8 and Apple's account-deletion guidance
   before exposing these options. Providers are configured in Supabase; the
   native app feature flag stays off until server configuration is complete.
   Google Cloud is in Testing with the owner's email added as a test user.
   Switch Google to the intended production audience before public release.

References:
- https://developer.apple.com/app-store/review/guidelines/#login-services
- https://developer.apple.com/support/offering-account-deletion-in-your-app/
- https://developer.apple.com/documentation/xcode/supporting-associated-domains
- https://supabase.com/docs/guides/auth/social-login/auth-apple
- https://supabase.com/docs/guides/auth/social-login/auth-google
