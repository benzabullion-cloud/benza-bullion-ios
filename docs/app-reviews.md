# App Store reviews

The Settings → Support & About section includes **Rate Benza Bullion**, which opens the App Store's write-review page for app 6811639929. It never depends on the automatic prompt being eligible. Opening it also defers automatic requests for 180 days; this records a page visit, not proof that a review was submitted.

Automatic requests use Apple's native StoreKit sheet. Eligibility starts when this update first observes signed-in use on this device; account age alone does not qualify. All conditions must hold:

- At least seven full days since first observed use.
- Use on at least five distinct local calendar days.
- Three successfully added holdings since observation began. Edits, failed saves, purchases, and account creation do not qualify.
- At least 180 days since the last automatic request attempt or manual review-page visit.

Only a successful new holding addition schedules the request, at least five seconds later and at least 45 seconds into the session. It is abandoned if the app backgrounds, signs out, changes account, leaves Portfolio, or opens a sheet/modal. Returning to the app records engagement but never schedules a request by itself. Native code rechecks foreground state and applies an independent device cooldown.

There is no sentiment screening, reward, custom rating popup, or automatic jump to the App Store. Local counters contain dates and a capped addition count, not holdings or personal details. Apple chooses whether to show the sheet, and the app cannot detect a submitted rating. TestFlight suppresses the native sheet; test engagement policy with `node --test tests/review-engagement.test.cjs`, test the Settings link on device, and verify native presentation with an Xcode development build. Production behavior still follows Apple's display policy.
