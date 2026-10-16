# Market news reliability patch

Build 114 embeds the failing rss2json integration and requires a replacement binary.
The replacement client uses the deployed public news service; it cannot patch Build 114 remotely.

## Behavior

The bundled app calls the public `benza-market-news` Edge Function rather than
rss2json. The function fetches four fixed Google News RSS searches for gold,
silver, platinum/palladium, and copper, plus a fixed Bing News RSS backup. Separate, focused metal searches replace the original all-topic query. A live
check of the original RSS query also returned articles; the observed HTTP 500
was from the rss2json conversion layer, not proof of an empty upstream feed. Only article titles, source names,
HTTPS article links and publication dates are returned; full articles are not
copied. No API subscription, account token or database access is required.

Requests are limited to fixed upstream URLs, two attempts of four seconds per feed, with a 250 ms retry delay, 1 MiB per
response and 24 returned headlines. Malformed XML, DTDs, invalid dates, unsafe
links, articles older than seven days and duplicates are excluded. One failed
feed does not discard other successful feeds. A complete failure returns 503
unless usable saved results remain.

The function coalesces concurrent refreshes, keeps successful results for ten
minutes, and backs off for one minute after total failure. Its last successful
result may be returned as explicitly stale for at most 24 hours. This cache is
per isolate and best effort, not durable or shared across regions. An independent Bing feed can supply recent articles during a Google-wide outage.
No design guarantees new articles when all providers are unavailable. The client separately retains successful results on the
device, bounds cache/article age to seven days, labels saved data, and never
resets a saved feed's timestamp on failure. It retries on entering News, returning
to the visible News screen, reconnecting, the 30-minute interval, or manual
Refresh. A 15-second client timeout and shared in-flight request keep Refresh
from hanging or issuing overlapping requests. The page layout is unchanged.

## Validation

Run from the repository root:

```sh
npm ci --prefix supabase/functions/benza-market-news --ignore-scripts
npx --yes deno@2.5.6 test --node-modules-dir=manual --config supabase/functions/benza-market-news/deno.json supabase/functions/benza-market-news/index_test.ts
node --test tests/market-news.test.cjs
node --test tests/statistics-accuracy.test.cjs tests/launch-account-purchases.test.cjs tests/final-launch-hardening.test.cjs tests/launch-sweep.test.cjs tests/guest-access.test.cjs
node tests/guest-browsing.cjs
node tests/market-news-live.cjs
```

The endpoint uses an exact parser version and committed npm lockfile. Local/CI tests use manual node_modules mode with `npm ci`; deployment uses
Deno's automatic npm resolution.
Seven endpoint tests and four client tests pass locally, including a complete Google outage with successful Bing fallback. The production endpoint returned HTTP 200 with 24 recent articles, no stale response, and all five feeds succeeding on October 16, 2026 UTC. The live browser gate uses actual deployed news, verifies recent articles, refresh, article links and offline timestamp preservation in Chromium and WebKit. Other app services are isolated in that test. A separate guest browser suite covers all viewports/themes and private-feature sheets.

## Release order

1. Install the locked function dependencies as above. Deploy only the new
   `benza-market-news` function to the existing project; the function-specific
   `supabase/config.toml` setting permits public guest requests. Do not disable
   JWT verification on any existing private function. This endpoint has no
   credentials, database reads, writes, or arbitrary URL proxying.
2. Smoke-test an unsigned GET to the deployed endpoint: HTTP 200, `status: ok`,
   nonempty recent `items`, valid `fetched_at`, HTTPS links and CORS headers.
   Confirm `OPTIONS` returns 204 and non-GET methods return 405.
3. Run the browser guest test and test actual News in the replacement build on
   iPhone: initial guest load, manual refresh, background/resume, offline saved
   data, timeout recovery and article opening. Validate source coverage and
   freshness in production before deciding to ship.
4. Build/upload a replacement only after that release decision. Build 114
   cannot use this endpoint without a client update; deploying the endpoint
   alone will not repair Build 114. Keep the replacement out of App Review until its release gates pass.

The function was deployed as version 1. App Store submission and binary selection must still be verified separately.
