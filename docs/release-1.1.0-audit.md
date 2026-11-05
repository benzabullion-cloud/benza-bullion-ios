# Benza Bullion 1.1.0 candidate audit

Date: November 5, 2026. Base: testflight/face-id-round-one at 0516fd6c0382685b5bffd0f84f2ee9778f7f60cf.

## Status

Not yet cleared for App Store submission. Local implementation and available source/database checks are complete. Uploading the modified source to GitHub was blocked by automatic approval review pending explicit authorization; therefore the candidate has not run native compilation or remote browser CI and has not been built or submitted. Build 126 predates these additions.

## Changes

- Settings feedback button opens an Apple mail composer with a release version and blank user message. User chooses whether to send; no automatic message, account identifier, logs, portfolio records, or attachment. No configured Mail account shows the contact address instead.
- Settings sharing opens native sharing with only a public App Store URL and app description; iPad popover is anchored. Cancellation is quiet and overlapping actions are blocked.
- Footer reads CFBundleShortVersionString from the signed app; no build number. Release is 1.1.0 across the app and extension. Use major.feature.fix versions, incrementing only when a release changes; Apple internal build numbers remain independent.
- Add/Edit Holding back button checks changes to holding fields and selected/staged attachments. Declining discard retains the form; close is blocked during a save. Successful saves and account cleanup can close without discard prompts.
- Privacy policy explains provider sign-in, opt-in device Keychain login, local review counters, feedback drafts, and public sharing.
- Expand CI coverage to recent device login, remember preferences, Apple deletion UI/revocation, ratings, and new Settings actions. Update three isolated older fixtures to supply newly referenced dependencies without removing their assertions.

## Verified locally

- 104/104 Node regression tests pass (all tests/*.test.cjs and tests/*.test.mjs): statistics, account boundaries, purchase/restore/refunds and expiry, guest access, sign-in, saved login, Apple token revocation, engagement, Settings actions, scanner flows and script parsing.
- Two embedded PostgreSQL suites pass: Free edits preserve Pro data; atomic purchases/ownership, sales/undo, file cleanup and cross-account permissions.
- Scanner inscription benchmark: 143 cases, zero failures. These are synthetic inscriptions, not a measurement of camera recognition accuracy.
- Python asset/identity checks: 11 tests pass.
- Info.plist, entitlements, and privacy manifest parse; git diff whitespace check passes.
- Existing Manage Apple Subscriptions is present. Failed holding save paths preserve input; successful saves update the portfolio and close the form.

## Live read-only checks

- All 15 public database tables have row-level security enabled. Account-facing policies constrain rows to auth.uid(); update policies include ownership checks.
- Deployed benza-delete-account version 27 is ACTIVE and contains Apple refresh-token revocation and issuer verification before account removal. A destructive live deletion was not performed.
- Security advisor flags authenticated SECURITY DEFINER RPCs: these are intentional application mutation endpoints. All 11 flagged RPCs check auth.uid(), have a pinned search_path, and deny anonymous execution. Embedded database tests exercise foreign-account rejection. Four backend-only RLS tables intentionally have no client policies.
- Public live checks returned HTTP 200: news status ok with eight articles; prices success with all five metals. Password AutoFill association returned JSON without redirects and lists L6P9LTSTM7.com.benzabullion.app.
- Existing leaked-password protection warning remains; this is an account-security improvement to evaluate separately, not an observed App Review failure.

## Required before submission

1. Authorize uploading these source changes to the existing GitHub repository, then run full native and Chromium/WebKit CI. Browser downloads were truncated locally and the installed Chromium cannot create the required socket in this environment; no visual/browser pass is claimed.
2. Build the exact audited candidate in Xcode Cloud. Verify signed version 1.1.0, entitlements, and privacy manifest, and inspect native warnings/errors.
3. Google public sign-in check PASSED (user-reported, November 5): owner completed Branding and production publishing flow, screenshots show only userinfo.email, userinfo.profile and openid declared as non-sensitive scopes; user confirmed TestFlight sign-in worked with an account outside the test-user list. Production Audience status was not separately captured after confirmation. This verifies the tested external account, not every account or managed Workspace policy.
4. On a physical iPhone: verify all three login options, cancellation, remembered login after logout, relaunch, recovery, existing holdings and Pro ownership; Apple Hide My Email may represent a different account. Verify Apple-linked account deletion/token revocation with a disposable account.
5. Test Settings review link, feedback composer/send/cancel/no-mail fallback, native share/cancel, release footer, and discard/failed-save behavior. Automatic StoreKit review sheets cannot be validated in TestFlight; development builds and the policy tests cover request behavior, and Apple decides whether to display a sheet.
6. Check App Store Connect privacy answers match the new login/feedback behavior and current backend collection; provide a working reviewer account and review notes explaining guest entry, provider sign-in, optional saved-login authentication and Pro purchase/restore.
7. Confirm public market/news endpoints and published legal/support pages remain healthy immediately before submission. Keep the bundled and published privacy policy consistent.

## Review notes draft

Version 1.1.0 improves account entry with Apple and Google sign-in, optional remembered login protected by device authentication, and clearer sign-in controls. Settings > Support & About offers a voluntary App Store review link, user-written feedback email draft, public app sharing, and the release version. Automatic StoreKit review requests are conservative and only eligible after meaningful use; Apple controls their display. Add/Edit Holding warns before discarding changed details. Guest access remains available for Markets, News and Calculator. Settings includes in-app account deletion, Restore Purchases and Apple subscription management. Supply verified device/OS testing details and current reviewer credentials separately; do not claim tests that have not been performed.
