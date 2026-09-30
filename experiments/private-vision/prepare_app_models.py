"""Explicit beta build setup. Never invoked by the app or a scan."""
import argparse
import json
from pathlib import Path
import shutil
from prepare_assets import ROOT, acquire, verify


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--download', action='store_true')
    parser.add_argument('--assets', type=Path, default=ROOT / 'assets')
    args = parser.parse_args()
    specs = json.loads((ROOT / 'assets.lock.json').read_text())['model']['files']
    destination = ROOT.parents[1] / 'App' / 'PrivateVisionModels'
    destination.mkdir(parents=True, exist_ok=True)
    manifest = destination / 'manifest.json'
    manifest.write_text('{"enabled":false,"version":"local-catalogue-v1"}\n')
    args.assets.mkdir(parents=True, exist_ok=True)
    for spec in specs:
        source = args.assets / spec['name']
        if not verify(source, spec):
            if not args.download:
                raise SystemExit('Verified model missing. Restore backups or explicitly use --download.')
            acquire(spec, args.assets)
        target = destination / spec['name']
        if not verify(target, spec):
            temporary = target.with_suffix('.partial')
            try:
                shutil.copyfile(source, temporary)
                if not verify(temporary, spec):
                    raise RuntimeError('Copied model failed verification')
                temporary.replace(target)
            finally:
                temporary.unlink(missing_ok=True)
    temporary_manifest = manifest.with_suffix('.partial')
    temporary_manifest.write_text('{"enabled":true,"version":"local-catalogue-v1","stage":"beta"}\n')
    temporary_manifest.replace(manifest)
    print('Fixed beta models bundled. Runtime scanning uses no network.')


if __name__ == '__main__':
    main()
