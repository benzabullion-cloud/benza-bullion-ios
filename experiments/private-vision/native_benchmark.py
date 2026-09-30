"""Exercise the portable native core locally with IP sockets blocked."""
import ctypes
import json
from pathlib import Path
import resource
import socket
import sys
import threading
import time

from identity_gate import parse_identity
from prepare_assets import ROOT, verify


def main():
    try:
        socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    except PermissionError:
        pass
    else:
        raise SystemExit('Run with LD_PRELOAD=assets/offline_guard.so; network isolation required.')
    from PIL import Image
    lock = json.loads((ROOT / 'assets.lock.json').read_text())
    assets = ROOT / 'assets'
    specs = lock['model']['files']
    if not all(verify(assets / spec['name'], spec) for spec in specs):
        raise SystemExit('Model integrity verification failed.')
    runtime = assets / 'runtime' / ('llama-' + lock['runtime']['release'])
    # Linux release uses dynamic CPU backends; Apple XCFramework bundles them.
    ggml = ctypes.CDLL(str(runtime / 'libggml.so'))
    ggml.ggml_backend_load_all_from_path.argtypes = [ctypes.c_char_p]
    ggml.ggml_backend_load_all_from_path(str(runtime).encode())
    lib = ctypes.CDLL(str(assets / 'libbenza_vision.so'))
    lib.benza_scan_create.restype = ctypes.c_void_p
    for name in ['benza_scan_cancel', 'benza_scan_destroy', 'benza_scan_is_running', 'benza_scan_stage']:
        getattr(lib, name).argtypes = [ctypes.c_void_p]
    lib.benza_scan_cancel.restype = None
    lib.benza_scan_rgb.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_char_p,
        ctypes.c_char_p, ctypes.c_void_p, ctypes.c_size_t, ctypes.c_uint32,
        ctypes.c_uint32, ctypes.c_int, ctypes.c_int, ctypes.c_void_p, ctypes.c_size_t]
    model = str(assets / specs[0]['name']).encode()
    projector = str(assets / specs[1]['name']).encode()
    prompt = (ROOT / 'catalogue-prompt.txt').read_bytes()
    image_path = Path(sys.argv[1]).resolve(strict=True)
    with Image.open(image_path) as image:
        rgb_image = image.convert('RGB')
        width, height = rgb_image.size
        rgb = rgb_image.tobytes()
    pixels = ctypes.create_string_buffer(rgb)
    def run(handle, output):
        return lib.benza_scan_rgb(handle, model, projector, prompt, pixels,
                                  len(rgb), width, height, 0, 120, output, len(output))
    canceled = lib.benza_scan_create()
    output = ctypes.create_string_buffer(1025)
    outcome = []
    worker = threading.Thread(target=lambda: outcome.append(run(canceled, output)))
    worker.start()
    until = time.monotonic() + 10
    while not lib.benza_scan_is_running(canceled) and worker.is_alive() and time.monotonic() < until:
        time.sleep(.005)
    if not lib.benza_scan_is_running(canceled):
        worker.join()
        raise SystemExit('Native worker did not start.')
    competing = lib.benza_scan_create()
    competing_output = ctypes.create_string_buffer(1025)
    if run(competing, competing_output) != 3 or competing_output.value:
        raise SystemExit('Concurrent worker was not rejected.')
    if lib.benza_scan_destroy(canceled) != 3:
        raise SystemExit('Running handle was incorrectly destroyed.')
    lib.benza_scan_cancel(canceled)
    worker.join(timeout=120)
    if worker.is_alive() or outcome != [2] or output.value:
        raise SystemExit('Cancellation lifecycle failed.')
    if lib.benza_scan_destroy(canceled) or lib.benza_scan_destroy(competing):
        raise SystemExit('Handle cleanup failed.')
    fresh = lib.benza_scan_create()
    started = time.monotonic()
    code = run(fresh, output)
    elapsed = time.monotonic() - started
    if code:
        stage = lib.benza_scan_stage(fresh)
        lib.benza_scan_destroy(fresh)
        raise SystemExit('Fresh native inference failed with code ' + str(code) + ' at stage ' + str(stage))
    identity = parse_identity(output.value.decode('utf-8'))
    repeated_output = ctypes.create_string_buffer(1025)
    if run(fresh, repeated_output) != 4 or repeated_output.value:
        raise SystemExit('Single-use handle retained reusable inference state.')
    if lib.benza_scan_destroy(fresh):
        raise SystemExit('Fresh handle cleanup failed.')
    repeated = []
    for image_path in sys.argv[2:]:
        with Image.open(Path(image_path).resolve(strict=True)) as image:
            rgb_image = image.convert('RGB')
            width, height = rgb_image.size
            rgb = rgb_image.tobytes()
        pixels = ctypes.create_string_buffer(rgb)
        next_handle = lib.benza_scan_create()
        next_output = ctypes.create_string_buffer(1025)
        started_next = time.monotonic()
        code = run(next_handle, next_output)
        if code:
            lib.benza_scan_destroy(next_handle)
            raise SystemExit('Repeated native scan failed with code ' + str(code))
        next_identity = parse_identity(next_output.value.decode('utf-8'))
        repeated.append({'identity': next_identity, 'elapsed_seconds': round(time.monotonic() - started_next, 2),
                         'process_peak_rss_kib': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss})
        if lib.benza_scan_destroy(next_handle):
            raise SystemExit('Repeated handle cleanup failed.')
    result = {'identity': identity, 'elapsed_seconds': round(elapsed, 2),
              'peak_child_rss_kib': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
              'cancel_then_fresh_scan': 'passed', 'concurrent_worker_rejected': True,
              'single_use_handle': True, 'production_enabled': False}
    result['subsequent_scans_same_process'] = repeated
    folder = ROOT / 'private-results'
    folder.mkdir(mode=0o700, exist_ok=True)
    (folder / 'native-metrics.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
