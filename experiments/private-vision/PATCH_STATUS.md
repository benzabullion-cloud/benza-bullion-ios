# Scanner integration handoff — September 30, 2026

The user explicitly approved pushing the scanner patch to existing draft PR #6.
https://github.com/benzabullion-cloud/benza-bullion-ios/pull/6

The remote branch had advanced independently to d7df853be78a4009e56589b182ea8941bdb7eb65.
Recovered work was reconciled with that commit; no force update is permitted.
Native reset cleanup, beta asset staging and the physical-memory gate are preserved.
The conservative design channel requires independently read metal, weight and contextual
markings or a verified catalogue profile before populating holding details. Model specifications are rejected.

The previous Apple run passed native Swift tests and generic iOS package compilation,
but the actual App compile failed because debug.xcconfig was missing and referenced
one directory above the project. The latest draft removes the obsolete configuration references. A new Apple run must verify the reconciled integration.

Local validation: 110 JavaScript checks and 7 Python boundary tests pass; inline scripts,
Info.plist, shell/Python syntax and whitespace checks pass. New actual App and Swift
wrapper compilation remains pending until the patch is published and Apple CI completes.
No physical-iPhone inference or performance evidence is claimed.

Ordinary builds retain manifest enabled=false. Xcode Cloud can bundle fixed weights
for the explicit scanner-private-vision-benchmark beta branch, or explicit
BENZA_BUNDLE_OFFLINE_VISION=1. Devices below 7 GiB physical memory retain OCR.
The retained-model command is prepare_app_models.py --assets /path/to/models;
it enables the test bundle after checksum verification. Runtime scanning never downloads
assets or uploads photos. Before production enablement, verify device accuracy, memory,
latency, heat, airplane mode, cancellation/retries and actual holding-form handoff.
