"""Explicit setup only. Recognition never calls this downloader."""
import argparse
import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import tarfile
import shutil
import subprocess

ROOT = Path(__file__).resolve().parent


def verify(path, spec):
    if not path.is_file() or path.stat().st_size != spec['bytes']:
        return False
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(4 * 1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest() == spec['sha256']


def acquire(spec, directory):
    target = directory / spec['name']
    if verify(target, spec):
        print('Verified:', spec['name'], flush=True)
        return
    temp = target.with_suffix(target.suffix + '.partial')
    print('Downloading fixed asset:', spec['name'], flush=True)
    try:
        # Use the platform TLS/certificate setup on Apple's build hosts. A
        # Python installation's certificate bundle must not block cloud setup.
        # HTTPS verification stays enabled; a failed transfer aborts the build.
        curl = shutil.which('curl')
        if not curl:
            raise RuntimeError('System curl is required for explicit asset setup')
        subprocess.run([
            curl, '--fail', '--location', '--show-error', '--silent',
            '--proto', '=https', '--proto-redir', '=https',
            '--connect-timeout', '30', '--max-time', '1200',
            '--retry', '3', '--retry-delay', '2', '--retry-max-time', '180',
            '--output', str(temp), spec['source_url']
        ], check=True)
        if not verify(temp, spec):
            raise RuntimeError('Asset size or checksum mismatch: ' + spec['name'])
        temp.replace(target)
    finally:
        temp.unlink(missing_ok=True)
    print('Verified:', spec['name'], flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify-only', action='store_true')
    args = parser.parse_args()
    lock = json.loads((ROOT / 'assets.lock.json').read_text())
    directory = ROOT / 'assets'
    directory.mkdir(exist_ok=True)
    specs = lock['model']['files'] + [lock['runtime']['linux_archive']]
    if args.verify_only:
        if not all(verify(directory / spec['name'], spec) for spec in specs):
            raise SystemExit('Missing or changed assets; recognition must remain unavailable.')
        print('All fixed assets verified. No network used.')
        return
    with ThreadPoolExecutor(max_workers=3) as pool:
        list(pool.map(lambda spec: acquire(spec, directory), specs))
    archive = directory / lock['runtime']['linux_archive']['name']
    runtime = directory / 'runtime'
    runtime.mkdir(exist_ok=True)
    with tarfile.open(archive) as source:
        source.extractall(runtime, filter='data')


if __name__ == '__main__':
    main()
