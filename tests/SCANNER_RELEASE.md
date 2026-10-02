# Bullion Scan Assist release checks

Keep Beta visible. Changes in this batch add inscription matches for palladium
Maples, platinum Maples and one-ounce platinum Eagles. Production OCR passes,
weight parser version 4, confidence thresholds and conflict handling are unchanged.

## Automated evidence

- `node tests/scanner-release-benchmark.cjs`: 143 synthetic inscription cases,
  including all 87 holding titles, five metals, fractions, bars, rounds, missing
  fields and negative cases. This is interpretation coverage, not camera accuracy.
- Existing scanner/design/review/photo-preview suites: reset, cancellation,
  partial review, edits, Pro gating and photo retention.
- `node tests/app-sweep.cjs`: Chromium and WebKit screen checks plus actual
  reviewed-scan handoff, quantity/cost calculation and two-photo save. Cloud
  services are mocked; these tests do not prove production database permissions.
- Native CI: Apple Vision reads the authorized silver Maple pair and official
  2025 platinum Eagle pair. The latter is a studio image, not a handheld test.
- CI stores separate inscription and photo benchmark JSON artifacts. The photo
  report counts correct, blank and incorrect fields separately, with pair timing.
  A missing side or missing output fails the gate.

## Adding private photo tests

Copy `tests/scanner-photo-cases.json` outside the repository. Each case requires
a unique ID, obverse/reverse paths and independently verified expected fields.
Local JPEG/PNG files and existing base64 fixtures are supported. Relative paths
resolve from the repository working directory. Do not commit private photos,
serial numbers, receipts or a manifest pointing to customer files.

On macOS, set `BENZA_SCANNER_PHOTO_MANIFEST` to that private manifest for both
commands after compiling the existing standalone OCR runner:

```
swiftc -O experiments/private-vision/NativeCore/Sources/BenzaPrivateVision/CoinRim.swift tests/real-photo-ocr.swift -o /tmp/benza-photo-ocr
BENZA_SCANNER_PHOTO_MANIFEST=/absolute/path/private-cases.json /tmp/benza-photo-ocr
BENZA_SCANNER_PHOTO_MANIFEST=/absolute/path/private-cases.json node tests/real-photo-gate.cjs
```

Only the test runner downloads explicitly listed U.S. Mint reference images.
The app itself stays on-device. Future official image URL changes fail the test,
not the production scanner. The runner uses shared rim processing and OCR
settings but a smaller pass set than the actual iOS camera; final phone checks
are still required.

## Phone acceptance before launch

Use one deployment to test a batch: a silver Eagle, silver Maple, fractional
gold coin, platinum coin, palladium coin, copper round, bar and uncommon coin.
Include reflective lighting and a fresh retry after each item. Verify metal and
weight against the coin, then quantity, per-piece/total cost, reviewed details,
both saved photos and reopening the holding. Test camera cancellation and the
photo-picker path. Wrong metal/weight, stale evidence or failed saving block
release; an unreadable year or uncommon name can be completed in review.

Do not describe 143 passing text cases or two photo pairs as a catalog-wide
camera accuracy rate. Broader camera coverage remains unverified until more
authorized real photo pairs or phone trials are recorded.
