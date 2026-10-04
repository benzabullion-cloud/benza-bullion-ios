# PR 43 launch sweep — October 4, 2026

Reviewed the bundled app, native StoreKit/export/scanner boundaries, verifier, deployed worker sources, migrations and release check configuration. This patch remains on `codex/sale-preview-quantity-clarity`; it is not in TestFlight 103.

## Reproduced and fixed

- Settings account-data JSON export now uses the native share sheet, like both CSV portfolio reports. Cancellation and errors recover the controls.
- Price alert saves/removals only update the local list after cloud success. Failures preserve the old alert and entered target, show an error, and permit retry. Concurrent alert writes are blocked.
- Sale and undo requests cannot overlap. Transport failures recover buttons. A sale remains bound to the selected holding ID across refreshed/reordered holdings.
- Holding deletion removes the requested ID and blocks repeat requests. Editing also applies returned data by holding ID rather than a potentially changed list index.
- Delayed sale, deletion, attachment, sign-in initialization and account-deletion responses cannot apply to a different signed-in account. Stale private photo/receipt previews cannot overwrite the next holding.
- Portfolio history paginates all records with deterministic timestamp/ID ordering. Old responses cannot overwrite a newly selected chart range, including LIVE.
- Authentication reuses its existing client so its session monitor stays attached. Purchase verification has a bounded timeout and preserves existing recoverable purchase behavior.

## Validation

- 60 local Node regression tests pass, including 11 new behavioral tests reproducing export, alert, sale, deletion, preview, account and chart failures.
- PostgreSQL/PGlite checks pass for Free/Pro edits, ownership isolation, atomic purchase claims, stale/revoked purchases, grace/expiry, plan aggregation, storage cleanup and role permissions.
- The 143-case synthetic inscription benchmark passes. This is parser regression evidence, not a claim of camera accuracy.
- Inline app and worker parsing checks pass. Shared scanner recognition rules and existing page layout are unchanged.
- Fresh Chromium/WebKit responsive/full-app checks, iOS compilation and real-photo Apple Vision checks must pass on this updated PR head before merging. The local browser download was blocked by this execution environment; those browser checks run in GitHub CI.

## Acceptance still required on the next TestFlight build

1. Save/share both CSV portfolio report entry points and the Settings JSON account-data export; cancel and retry.
2. Monthly/annual/Founder purchase, cancellation, restore, relaunch/reconnect recovery and account binding. Check introductory-trial eligibility and current localized pricing.
3. Full/partial/$0 sale, excessive quantity validation, sale correction and undo; confirm History and realized performance.
4. New signup/email activation shows Bullion Builder; custom/legacy names survive login and edits. Name guidance appears only in Settings.
5. Scanner front/reverse/reset, reviewed prefill and saved photos; permissions denied/re-enabled. Only Bullion Scan Assist is Beta.
6. Password reset and confirmation links from an installed iPhone; offline sign-out/relaunch and account switching.
7. Notifications, private attachments/deletion, VoiceOver/larger text, landscape and final signed archive/model download.
8. App Store Connect metadata, screenshots, privacy disclosures, review login, legal/support URLs, agreements and purchase configuration.

No merge, TestFlight upload, backend deployment or App Review submission is performed by this sweep.
