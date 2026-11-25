#!/bin/sh
set -eu
benza_stage=locate-repository
trap 'benza_exit=$?; if [ "$benza_exit" -ne 0 ]; then printf "Benza asset setup failed at stage: %s (exit %s)\n" "$benza_stage" "$benza_exit" >&2; fi' EXIT
benza_root="${CI_PRIMARY_REPOSITORY_PATH:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}"
cd "$benza_root"
benza_stage=prepare-fixed-apple-sdk
printf 'Benza setup: %s\n' "$benza_stage"
if [ -n "${BENZA_APPLE_SDK_ARCHIVE:-}" ]; then
    python3 experiments/private-vision/prepare_apple_sdk.py --archive "$BENZA_APPLE_SDK_ARCHIVE"
else
    python3 experiments/private-vision/prepare_apple_sdk.py --download
fi
# Scanner models are packaged separately as Apple-hosted Managed Background Assets.
benza_stage=complete
printf 'Benza asset setup complete\n'
