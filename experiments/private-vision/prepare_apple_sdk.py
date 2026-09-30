"""Explicit developer setup for the fixed Apple SDK. Never called by scanning."""
import argparse
import os
from pathlib import Path
import shutil
import stat
import subprocess
import zipfile

from prepare_assets import ROOT, acquire, verify

SPEC = {'name': 'llama-b11146-xcframework.zip', 'bytes': 58177795,
        'sha256': '1c306afe9fe68a90c4bdc74619d8558d6e0754f085deb105dd2d70293a9a964f',
        'source_url': 'https://github.com/ggml-org/llama.cpp/releases/download/b11146/llama-b11146-xcframework.zip'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--download', action='store_true')
    parser.add_argument('--archive', type=Path)
    args = parser.parse_args()
    if args.download and args.archive:
        raise SystemExit('Choose a retained archive or an explicit download.')
    assets = ROOT / 'assets'
    assets.mkdir(exist_ok=True)
    if args.download:
        acquire(SPEC, assets)
    archive = args.archive or assets / SPEC['name']
    if not verify(archive, SPEC):
        raise SystemExit('Fixed SDK missing or changed. Provide its retained archive or --download.')
    staging = assets / 'apple-sdk-staging'
    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir()
    with zipfile.ZipFile(archive) as source:
        for name in source.namelist():
            path = Path(name)
            if path.is_absolute() or '..' in path.parts:
                raise SystemExit('Invalid archive path.')
        if shutil.which('ditto'):
            subprocess.run(['ditto', '-x', '-k', str(archive.resolve()), str(staging.resolve())], check=True)
        else:
            for item in source.infolist():
                destination = staging / item.filename
                if stat.S_ISLNK(item.external_attr >> 16):
                    link = source.read(item).decode('utf-8')
                    if Path(link).is_absolute() or not (destination.parent / link).resolve().is_relative_to(staging.resolve()):
                        raise SystemExit('Invalid SDK symlink.')
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    os.symlink(link, destination)
                else:
                    source.extract(item, staging)
    framework = staging / 'build-apple' / 'llama.xcframework'
    if not (framework / 'Info.plist').is_file():
        raise SystemExit('Unexpected SDK archive structure.')
    vendor = ROOT / 'NativeCore' / 'Vendor'
    vendor.mkdir(exist_ok=True)
    target = vendor / 'llama.xcframework'
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(framework, target, symlinks=True)
    print('Verified fixed Apple SDK prepared. No models or photos downloaded.')


if __name__ == '__main__':
    main()
