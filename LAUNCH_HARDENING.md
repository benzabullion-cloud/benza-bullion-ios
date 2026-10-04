# Final launch hardening — deployment and acceptance

Only Bullion Scan Assist is Beta. The rest of Benza Bullion is the launch app. The shared scanner identification/parser rules are unchanged by this pass.

## Implemented

- Sign-in X clears the complete password and conceals the field; eye toggles visibility without changing the value or cursor. Both controls have accessible labels, 44px touch targets and remain outside form submission.
- Persist account/product intent before Apple purchase UI. Completed-but-unverified and pending transactions retry on reconnect/sign-in; cancelled purchases clear their intent. Old Free purchases still require explicit restore.
- Native verified revocations reach JavaScript. Active Pro accounts reconcile against Apple when foregrounded or when StoreKit reports no current entitlements.
- Verifier consults Apple Server API for current transaction/subscription status; validates account binding, expiry, grace expiry, bundle, environment and ownership type. Signed notification V2 endpoint rechecks authoritative current status. API failures preserve recoverable transactions rather than finishing them.
- Service-only atomic database RPC claims one purchase family per account, rejects stale observations, retains deletion tombstones, and aggregates active plans so an expired subscription cannot overwrite Founder/another active plan. Seeded legacy ownership can restore on its existing account; unclaimed unbound legacy receipts require support.
- Grace expires at its verified deadline in frontend and database checks.
- Workers use ordered pagination for subscribers, alerts and holdings. Missing required quotes suppress portfolio notifications/baseline updates. Failed preference lookups skip that account instead of applying enabled defaults. Quotes have bounded fetch timeouts.
- Private attachment cleanup is queued by record changes and failed upload handling. The existing snapshot worker retries deletion and discovers unreferenced uploads older than 24 hours; it protects live holdings and undoable sale references. Storage bytes are removed through the Storage API, never by deleting storage metadata.
- Sign-out hides account data immediately and removes the persisted local session on SDK failure. Notification detachment is best effort. Password reset from native uses the public HTTPS recovery page.
- Pro Plans exposes Restore Purchases, Terms of Use and Privacy Policy. Billing terms and scanner naming are consistent. Dependencies are pinned; verifier has a lockfile.

## Required configuration before activating the verifier

The new verifier deliberately requires Apple current-status verification credentials. Do not deploy it with missing credentials or mix old upsert-only verifier code with the final release configuration.

Vercel project `benza-storekit-verifier` needs existing `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, plus `APPLE_PRIVATE_KEY` (In-App Purchase server API .p8 key, real newlines or escaped `\n`), `APPLE_KEY_ID`, `APPLE_ISSUER_ID`, and `APPLE_APP_ID=6811639929` (confirm app ID in App Store Connect). Keep every secret server-only.

Configure App Store Server Notifications **Version 2**, production and sandbox, to:
`https://benza-storekit-verifier.vercel.app/api/apple-notifications`

Request a signed Apple test notification and confirm a 200 response. Verify a real sandbox purchase, renewal, refund, grace expiration and restore end to end. Unit fixtures mock Apple boundaries; they do not establish live credentials/notification configuration.

Deploy the database migration before the new verifier or snapshot worker. Deploy worker sources from `supabase/functions/`. They retain existing custom worker-token validation; do not make cron calls public. Existing schedules can remain unchanged: notification worker each minute and snapshot/cleanup worker every 15 minutes.

Confirm monthly and annual subscriptions share the intended subscription group and equal access level. Founder should be a non-consumable one-time purchase. Do not enable Family Sharing with this account-bound implementation; a shared receipt is rejected explicitly rather than granting one purchase across unrelated accounts.

## Remaining release-account/device gates

These are configuration/acceptance checks, not additional scanner feature work:

- Enable Supabase leaked-password protection if the project plan supports it. The available connector does not expose Auth settings.
- Supabase Auth must allow `https://benzabullion.com/index.html` recovery redirects. Test reset and email confirmation from an installed iPhone; the public recovery page changes the password, then the user signs back into the app.
- Preserve iPhone-only, iOS 26+ availability unless intentionally changing the supported-device plan. Native asset-pack APIs require compatibility review before lowering the target.
- Final signed archive must have a build number newer than prior TestFlight uploads. CI compilation is unsigned and excludes hosted model assets; verify actual archive and model download on a device.
- Verify final VoiceOver, larger text, portrait/landscape, offline sign-out/relaunch, account switching, private-file deletion retry and account deletion with active Apple billing.
- Complete App Store Connect screenshots, privacy answers, legal/support URLs, age rating, countries, agreements/tax/banking, review login and purchase metadata. Describe only Bullion Scan Assist as Beta in review notes.

## Regression checks

Run `node --test tests/*.test.cjs`, `node tests/scanner-release-benchmark.cjs`, and, with PGlite installed, `node tests/holding-base-edits.cjs` plus `node tests/final-launch-database.cjs`. Browser CI exercises the real sign-in controls and all existing app screen/form states. Native CI compiles the changed StoreKit boundary. New tests cover 1,501-row workers, payment verification outages, privacy failure paths, Apple current-status decisions, atomic ownership, stale updates, grace expiry, multi-plan aggregation, storage cleanup and role permissions.
