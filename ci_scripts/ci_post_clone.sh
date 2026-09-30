#!/bin/sh
set -eu
benza_root="${CI_PRIMARY_REPOSITORY_PATH:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}"
cd "$benza_root"
if [ -n "${BENZA_APPLE_SDK_ARCHIVE:-}" ]; then
    python3 experiments/private-vision/prepare_apple_sdk.py --archive "$BENZA_APPLE_SDK_ARCHIVE"
else
    python3 experiments/private-vision/prepare_apple_sdk.py --download
fi
# Explicit TestFlight validation marker enables main-branch cloud beta builds.
# Remove the marker before preparing a public App Store release. Ordinary local
# builds retain the disabled tracked manifest; recognition never downloads assets.
benza_branch="${CI_PULL_REQUEST_SOURCE_BRANCH:-${CI_BRANCH:-}}"
benza_beta_marker=App/PrivateVisionModels/TESTFLIGHT_BETA
if [ "$benza_branch" = scanner-private-vision-benchmark ] || [ "${BENZA_BUNDLE_OFFLINE_VISION:-0}" = 1 ] || { [ "$benza_branch" = main ] && [ -f "$benza_beta_marker" ]; }; then
    python3 experiments/private-vision/prepare_app_models.py --download
fi
