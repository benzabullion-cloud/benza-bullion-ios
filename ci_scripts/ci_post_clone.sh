#!/bin/sh
set -eu
benza_root="${CI_PRIMARY_REPOSITORY_PATH:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}"
cd "$benza_root"
python3 experiments/private-vision/prepare_apple_sdk.py --download
# Only explicitly selected beta builds contain the experimental 1.55 GB weights.
benza_branch="${CI_PULL_REQUEST_SOURCE_BRANCH:-${CI_BRANCH:-}}"
if [ "$benza_branch" = scanner-private-vision-benchmark ] || [ "${BENZA_BUNDLE_OFFLINE_VISION:-0}" = 1 ]; then
    python3 experiments/private-vision/prepare_app_models.py --download
fi
