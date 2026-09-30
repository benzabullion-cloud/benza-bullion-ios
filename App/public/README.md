# Benza Bullion — Supabase Cloud MVP

This project contains the complete Benza Bullion portfolio MVP with Supabase authentication and cloud-backed holdings.

## Files
- `index.html` — full Benza Bullion app
- `supabase_schema.sql` — holdings table + row-level security policies
- `README.md` — setup notes

## Supabase setup
The app is already pointed at this Supabase project URL:
`https://wblibufurkquqgcavzim.supabase.co`

On the login screen, paste your Supabase **Publishable key** (never a secret/service-role key). The browser stores that publishable key locally on your device so you do not need to re-enter it every time.

Run `supabase_schema.sql` once in the Supabase SQL Editor. It creates the `holdings` table and enables Row Level Security so authenticated users can only read and modify their own holdings.

## Current MVP features
- Create account / log in with Supabase Auth
- Persistent login session
- Cloud holdings tied to authenticated user ID
- Add and delete gold/silver holdings
- Live gold/silver price feed
- Portfolio value, gain/loss, allocations and cost basis
- Sign out from the avatar

## Security
Use only the Supabase publishable/anon key in the browser. Never place a secret or service-role key in this frontend.


## Activity history
This build adds a Supabase-backed `transactions` table and a working Activity screen. New holdings create `buy` activity records; removing a holding creates a permanent `remove` activity record.


## Coin catalog + metal icon update
- Expanded the Add Holding selector with widely recognized gold and silver bullion/historic coin names.
- Replaced gold/silver medal emoji with clean solid gold and silver circles throughout the UI.


## Edit Holding
Holdings now include an Edit button. Changes update the Supabase holdings row and create an `update` transaction in Activity.

## Benza Analytics Pro
Adds a full precious-metals analytics dashboard with:
- portfolio value, cost basis, unrealized gain/loss and return
- total ounces, positions and pieces
- separate gold/silver ounces, market value, average cost per ounce, spot, break-even and return
- value allocation donut and gold/silver market ratio
- +/- 5% and +/- 10% spot-price sensitivity modeling
- collection concentration, unique products and acquisition dates
- holding performance leaderboard
- dynamic smart insights
- explicit spot-only valuation disclosure

No new Supabase tables are required for this version.


## Functional chart ranges
The Portfolio line-chart 1D / 1M / 1Y controls are now interactive and redraw the chart.
Important: this MVP does not yet persist historical portfolio snapshots or historical spot-price series, so the range curves are clearly implemented as deterministic visual previews anchored to the current portfolio value. A future data-history layer should replace these previews with actual historical portfolio valuation data.


## PWA / installable app
This build adds:
- manifest.webmanifest
- iPhone/Android home-screen install metadata
- standalone app display mode
- Benza Bullion app icons
- service worker for app-shell caching and basic offline launch
- continued live Supabase/API access when online

### iPhone install
Open the deployed Netlify site in Safari, tap Share, then Add to Home Screen.


## Live price feed fix
Replaced the previous precious-metals endpoint with the XAUS spot API.
The app now reads live USD/troy-ounce gold and silver prices, refreshes every 30 seconds,
and shows whether the quote is live or a last-known/stale quote.


## Five-metal expansion
Adds Gold, Silver, Platinum, Palladium and Copper throughout:
- live scrolling market ticker
- holding creation/editing
- metal-specific minted icons and names
- product/coin catalogs
- portfolio valuation
- allocation and metal-performance analytics
- break-even, return, leaderboard, concentration and sensitivity analytics

Live feed uses Gold API symbols XAU, XAG, XPT, XPD and HG. Precious metals are valued per troy ounce.
Copper's HG quote is treated as USD per avoirdupois pound and converted to USD/oz for portfolio math.

IMPORTANT: Run `supabase_5_metals_migration.sql` once in Supabase SQL Editor before adding the new metal types.


## Compact dashboard update
Desktop/tablet layout has been tightened so the primary dashboard is designed to fit within one viewport:
- smaller header
- five live metal cards in one row
- tighter portfolio and allocation panels
- shorter chart
- compact bottom navigation
- secondary home sections hidden on large screens because they remain available in their dedicated tabs


## v5 one-row mobile ticker
This version fixes the actual `.marketCards` / `.marketCard` components used by the app.
On phone-sized screens, Gold, Silver, Platinum, Palladium, and Copper are forced into one
five-column row with no horizontal scrolling. Header, ticker status, portfolio summary,
and chart spacing were also tightened to preserve viewport space.


## Scan Coin menu
The Home dashboard layout is unchanged.
Only the existing floating + button now opens:
- Scan Coin
- Add Manually
- Cancel

Add Manually uses the existing holding form unchanged.
Scan Coin opens a separate camera/photo-capture screen. AI coin identification is not yet connected;
the confirmation-based recognition engine is the next implementation step.


## Uniform metal emblems
Holding rows and Activity now use the same five-metal visual identity as the live ticker:
Gold/Au, Silver/Ag, Platinum/Pt, Palladium/Pd, Copper/Cu.
No Home dashboard layout changes were made.


## Real portfolio graph
The existing Home graph now reads actual portfolio snapshots from Supabase instead of generated preview curves.

- 1D / 1W / 1M / 3M / 1Y / ALL query real saved values.
- A snapshot is upserted into a 30-minute bucket whenever live prices refresh while the app is open.
- Adding, editing, or removing a holding records the new portfolio state immediately.
- No fake historical data is generated. History begins when this feature is activated.
- `supabase_portfolio_history.sql` must be run once before deploying this build.

Background snapshot recording while the app is completely closed is not yet included; that requires a scheduled server-side job/Edge Function and can be added as the next backend step.


## Feature Pack v9
Bundles the requested three additions:

1. Real / updating portfolio graph
- Reads actual Supabase portfolio snapshots for 1D / 1W / 1M / 3M / 1Y / ALL.
- Fixes the renderer so the saved snapshot line actually updates.
- Touch or drag the graph to inspect historical value and time.
- Does not invent past history.

2. Stack Statistics
- Total pieces, positions, metals owned, unique products.
- Per-metal pieces, ounces, and current value.
- Added inside Benza Analytics.

3. Market Insights / News
- New News tab.
- Swipeable live bullion headlines with source/date/article link.
- Benza 'Why it matters' context based on headline topic.
- Six evergreen bullion learning cards.
- Refreshes when opened and every 30 minutes while the News section is open.
- Falls back to Benza educational guidance if the live feed is unavailable.
- No secret news API key is embedded.

Important: run `supabase_portfolio_history.sql` once in Supabase before deploying this build.

v53 notifications:
- Adds Settings > Price Notifications controls and a local test notification.
- Adds Web Push support to service-worker.js.
- Adds cloud-backed Markets targets with localStorage fallback.
- Run supabase_notifications.sql before enabling cloud targets/subscriptions.
- Deploy supabase/functions/check-price-alerts and schedule it to run periodically.
- VAPID public key is intentionally safe in index.html; VAPID private key must be stored only as a Supabase Edge Function secret and never deployed to Netlify.


v54 push-key update:
- Retrieves the VAPID public key directly from the deployed benza-price-alerts Edge Function.
- Removes the obsolete hard-coded v53 VAPID public key.
- Detects an old push subscription created with the prior key and asks the user to reconnect.
- Re-subscribes the installed PWA with the server-matching key and saves the device subscription to notification_subscriptions.
- Service worker cache bumped to v54.

## v56 notification upgrade

v56 adds per-user notification preferences in Settings:
- Price Targets
- Daily Portfolio Summary (default off, 8 AM local time)
- Big Market Moves (default 3% daily move)
- Portfolio Milestones ($1k, $2.5k, $5k, $10k, $25k, $50k, $100k)

Before deploying the app, run `supabase_notification_preferences_v56.sql` in Supabase SQL Editor and replace the deployed `benza-price-alerts` Edge Function with `supabase/functions/benza-price-alerts-index-v56.ts`.

The scheduled Edge Function should run repeatedly (recommended: every minute) so alerts can arrive while the app is closed.


## v62 housekeeping
- Added Help & Support page and public support contact.
- Added Support & About section in Settings with version information.
- Legal/support pages now navigate in-app and Back to Settings deep-links correctly reopen Settings.
- Service-worker app shell now caches Privacy, Terms, and Support pages.


## v63 production hardening
- Added non-disruptive offline/online status messaging.
- Cached last successful metal prices for graceful offline/feed-failure fallback.
- Added an 8-second timeout to live metal-price requests.
- Added expired-session handling that returns the user to sign-in instead of leaving stale authenticated UI.
- Improved holdings/history failures so transient network issues do not wipe the current interface.
- Updated the service-worker cache version.


## v64 pre-native iOS readiness
- Keeps web/PWA behavior unchanged while adding native-only safe-area handling for a future Capacitor iOS shell.
- Adds viewport-fit=cover, apple-touch-icon, and iOS format-detection metadata.
- Detects Capacitor at runtime and adds `html.native-app` only in a native shell.
- Prevents web Service Worker registration inside a native Capacitor shell to avoid cache/runtime conflicts.
- Keeps the existing PWA Service Worker and Web Push behavior unchanged on the deployed web app.
- Updates the PWA description to cover all five supported metals.
- App Store public URLs after deployment remain `/privacy.html`, `/terms.html`, and `/support.html`.
- Native APNs push is intentionally not implemented here; it should be added during the actual iOS/Capacitor phase.


## v65 Settings cleanup
- Fixed Privacy, Terms, and Support Back to Settings navigation with a robust `?open=settings` deep link.
- Added Notifications as its own Settings tab.
- Settings tabs are now Settings / Notifications / Activity.
- Main Settings screen is cleaner while preserving Account, Support & About, Legal & Privacy, and account deletion.
- Home, ticker, welcome line, bottom navigation, and other approved layouts are unchanged.


## v68 Coin Scan
- Add sheet remains swipe-down dismissible.
- Scan Coin keeps photo capture local in the web build and no longer calls a paid AI service.
- The native iOS build is prepared to use an on-device `BenzaCoinScanner` Capacitor plugin backed by Apple Vision so there is no per-scan API charge.
- Users must review the suggestion before the manual Add Holding sheet is prefilled. Nothing is auto-saved.

## v70 no-cost Coin Scan
- Removed the OpenAI/paid API coin-scan path and the `benza-coin-scan` Edge Function from the bundle.
- Web/PWA Coin Scan still captures and previews the photo locally but does not upload it for recognition.
- Added a native bridge hook for a future `BenzaCoinScanner` Capacitor plugin using Apple Vision on-device recognition.
- No OpenAI API key or scanner billing is required for this build.
- The Add sheet swipe-down dismissal from v67 remains intact.


## v70 production polish
- Preserves the approved Home/ticker/navigation/settings layouts.
- Adds duplicate-submit protection/loading states to holding, profile, password, and watchlist saves.
- Adds friendlier user-facing save errors and stronger numeric/account validation.
- Improves first-use/empty-state copy.
- Market Insights still refreshes live headlines every 30 minutes while open, caches the most recent successful headlines for temporary feed outages, deduplicates/sorts stories, and shows up to 12 current items.
- Benza Tips now rotate 6 tips daily from a built-in 30-tip educational library with no API cost.
- Coin Scan remains camera/preview-only on web; no-cost automatic identification is reserved for the native iOS on-device scanner.
- App version display is 1.0.0 / web build v70 and the service-worker cache is bumped to v70.


## v71 UI consistency cleanup
- Removed internal implementation/cost language from user-facing News and Coin Scan copy.
- Benza Tips still rotate daily, but no implementation details are shown to users.
- Add Holding now uses the exact approved five metal emblem artwork already used on the Home ticker.
- Home/ticker/navigation/Settings layout unchanged.

## v72 interaction cleanup
- Fixed the Add to Portfolio bottom sheet so swiping down from either the grab handle or title reliably dismisses it on iPhone/Safari.
- Replaced the unreliable Add Holding emblem images with clean chemical-symbol markers (Au, Ag, Pt, Pd, Cu) for a natural, consistent selector.
- Home ticker artwork/layout remains unchanged.


## v75
- Fixed the global + button so Add to Portfolio opens above the currently viewed tab (Analytics, News, Markets, Settings, etc.) instead of only becoming visible after returning Home.
- Preserves the v73 swipe-down behavior and approved layouts.


## v76
- Added a third Markets tab: **Coming Soon**.
- Added a polished Benza Buy & Sell preview for the future bullion marketplace idea.
- Preview highlights price comparison, trusted sources, and buy/sell routing without enabling transactions yet.
- Updated Settings build label to v76 and service-worker cache to v76.
- Existing Home, ticker, nav alignment, Settings layout, and current Markets functionality remain unchanged.


## v77
- Fixed Add Bullion globally across all tabs by portaling Add to Portfolio, manual Add Holding, and Scan Coin directly under document.body.
- Removed reliance on the Popover API for this flow to avoid iOS/PWA stacking inconsistencies.
- Raised add-flow surfaces above Analytics, News, Markets, Settings, and future overlays.


## Private Smart Camera simplification
- Scan photos are processed in memory by the native Apple Vision plugin. The scanner returns recognized text to the app; it has no image upload or photo persistence path. Optional portfolio attachments are a separate, user-selected feature.
- Pro users go straight to capture. A compact result card shows product, metal, and weight. Review holding is available only for a usable catalog product with a positive weight and no conflicting evidence. Incomplete results ask for one reverse photo, then stay on the result screen with retry/manual options.
- Photo attempts are counted separately from recognized evidence. Two unreadable photos offer a fresh attempt instead of an endless reverse loop.
- Fresh attempts clear all prior evidence, cancellation never mixes items, and failed or superseded resets cannot open a camera.
- Recognition is based on markings and verified product rules. Artwork-only recognition is not implemented, and scanning does not authenticate bullion.
- Run scanner checks from the repository root with `node tests/smart-camera.test.cjs`, `node tests/smart-camera-flow.test.cjs`, and `node tests/smart-camera-simple-flow.test.cjs`. Physical iPhone testing is still required for photo/OCR accuracy.

## Smart Camera review regression fix
- A metal-only two-photo result cannot open an empty holding. Product, metal, weight, and conflict validation apply both to the review control and the handoff function.
- Complete scans remain on a compact result card until Review holding is selected. Nothing is auto-added.
- Hidden Inventory & records sections now explicitly honor their hidden attributes, preventing both the Pro form and upgrade teaser from rendering together.
- Review regression tests exercise the actual openAdd, selectMetal, and product option setup instead of stubbing the handoff.


## Smart Camera OCR evidence isolation (engine 3)
- Native OCR returns each pass separately. Crops and rotations are alternative readings of the same photo, rather than ten independent inscriptions to concatenate.
- The web layer selects coherent evidence, adds compatible partial readings, and retains plating/replica warnings. Equally complete and confident contradictory alternatives remain blocked.
- The scanner keeps the existing native observation threshold; this change does not claim calibrated recognition confidence or implement artwork recognition.
- Incomplete results explain whether text, metal, weight, product matching, or conflicting evidence prevented review. A collapsed local Scanner check shows only build, timing, counts, and field-presence flags. It never includes images, OCR text, or serials and is cleared on a fresh attempt.
- Synthetic regressions reproduce alternate-pass weight contamination and exercise ambiguity, warning retention, old native payload compatibility, diagnostics privacy, and reset. Apple Vision performance and real photo accuracy require physical iPhone validation.

## Offline design integration (engine 4, device-test gate)
- Native design suggestions use a fixed local model and remain separate from OCR. Ordinary release inference is disabled by default; an explicitly selected beta branch can bundle the fixed assets for iPhone validation. No hosted API or subscription is involved.
- Artwork-only front evidence survives for a reverse photo. Conflicting designs, markings and unsupported replies block review; model specifications cannot populate holdings.
- Reset waits for native inference cleanup, preventing a canceled scan from stacking another model in memory. Unavailable test assets preserve OCR results.
- See `experiments/private-vision/README.md` for retained-asset test-build setup and outstanding physical-device gates.
