#!/bin/sh
set -eu

repo_root="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
cd "$repo_root"

python3 experiments/private-vision/prepare_app_models.py --download
mkdir -p build/background-assets
xcrun ba-package experiments/private-vision/apple-hosted-models.json -o build/background-assets/BenzaPrivateVisionModels.aar
printf 'Created %s
' "$repo_root/build/background-assets/BenzaPrivateVisionModels.aar"
