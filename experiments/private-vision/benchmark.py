"""Run one private local image. Writes private results only; never downloads assets."""
import argparse
import json
import os
from pathlib import Path
import resource
import subprocess
import time

from prepare_assets import ROOT, verify


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('image', type=Path)
    parser.add_argument('--timeout', type=int, default=360)
    parser.add_argument('--prompt', type=Path, default=ROOT / 'prompt.txt')
    parser.add_argument('--case', choices=['single', 'eagle', 'maple', 'round'], default='single')
    args = parser.parse_args()
    image = args.image.resolve(strict=True)
    prompt = args.prompt.resolve(strict=True)
    lock = json.loads((ROOT / 'assets.lock.json').read_text())
    assets = ROOT / 'assets'
    specs = lock['model']['files'] + [lock['runtime']['linux_archive']]
    if not all(verify(assets / spec['name'], spec) for spec in specs):
        raise SystemExit('Missing or changed assets. Run explicit setup first.')
    guard = assets / 'offline_guard.so'
    if not guard.is_file():
        raise SystemExit('Compile offline_guard.c before recognition.')
    runtime = assets / 'runtime' / ('llama-' + lock['runtime']['release'])
    command = [str(runtime / 'llama-mtmd-cli'), '-m', str(assets / specs[0]['name']),
               '--mmproj', str(assets / specs[1]['name']), '--image', str(image),
               '-f', str(prompt), '-n', '220', '-c', '4096',
               '-t', '4', '--temp', '0', '--no-mmproj-offload',
               '--image-min-tokens', '1024', '--image-max-tokens', '1024']
    env = dict(os.environ, LD_PRELOAD=str(guard))
    # Confirm the isolation hook is active before opening any customer photo.
    check = subprocess.run(['python', '-c',
        'import socket; socket.socket(socket.AF_INET, socket.SOCK_STREAM)'],
        env=env, capture_output=True)
    if check.returncode == 0 or b'Operation not permitted' not in check.stderr:
        raise SystemExit('Network isolation check failed.')
    private_root = ROOT / 'private-results'
    private_root.mkdir(mode=0o700, exist_ok=True)
    result_dir = private_root / args.case
    result_dir.mkdir(mode=0o700, exist_ok=True)
    started = time.monotonic()
    try:
        result = subprocess.run(command, env=env, capture_output=True, timeout=args.timeout)
    except subprocess.TimeoutExpired:
        raise SystemExit('Timed out; worker stopped. No app state was changed.')
    elapsed = time.monotonic() - started
    # Runtime emits generated text through its logger. Do not use --log-disable.
    (result_dir / 'stdout.txt').write_bytes(result.stdout)
    (result_dir / 'stderr.txt').write_bytes(result.stderr)
    metrics = {'exit_code': result.returncode, 'elapsed_seconds': round(elapsed, 2),
               'peak_child_rss_kib': resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss,
               'production_enabled': False, 'network_sockets_blocked': True}
    (result_dir / 'metrics.json').write_text(json.dumps(metrics, indent=2) + '\n')
    print(json.dumps(metrics))
    raise SystemExit(result.returncode)


if __name__ == '__main__':
    main()
