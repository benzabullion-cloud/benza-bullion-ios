# Private vision experiment — not enabled in the app

This tests actual image understanding as an alternative to the existing OCR and
literal-name matching scanner. It does not change the camera, add holdings, or
claim that recognition is launch ready.

## Ownership and availability

The candidate is Qwen3-VL-2B-Instruct (Apache-2.0), run by llama.cpp (MIT).
`assets.lock.json` fixes the model revision, runtime commit, byte lengths, and
SHA-256 digests. Setup is an explicit developer operation. Recognition loads
local files and never invokes setup, a hosted API, account verification, quota
checks, or automatic updates. No API key or payment card is required.

Keeping this version means upstream pricing or functionality changes do not
change the downloaded executable or model. Before shipping, Benza must retain
its own durable copies of the weights, projector, runtime source, build tools,
licenses and applicable notices. A pinned third-party download URL alone does
not protect new installations against the source disappearing. Existing bundled
copies do not depend on that URL. Distribution must satisfy the licenses; future
versions can have different licenses and must be reviewed separately.

This avoids a model subscription. It does not eliminate maintenance for future
iOS versions, device memory limits, app distribution, or security fixes. Running
it on Benza's server would require available hardware and operating costs; a
hosted free tier would reintroduce the policy dependency this experiment avoids.

## Reproduce on Linux

```sh
python experiments/private-vision/prepare_assets.py
gcc -shared -fPIC experiments/private-vision/offline_guard.c -ldl \
  -o experiments/private-vision/assets/offline_guard.so
python experiments/private-vision/prepare_assets.py --verify-only
python experiments/private-vision/benchmark.py /absolute/path/to/private-photo.jpeg
python experiments/private-vision/benchmark.py /absolute/path/to/private-photo.jpeg \
  --prompt experiments/private-vision/catalogue-prompt.txt --case eagle
python -m unittest discover -s experiments/private-vision -p 'test_*.py' -v
```

Setup downloads only public software and model assets. It does not accept or
send photos. The benchmark checks assets before use and launches a fresh worker
for each scan. The worker's IPv4 and IPv6 sockets are blocked using a Linux
preload hook, checked before reading the photo. This is an experiment isolation
mechanism for this runtime, not a security sandbox for arbitrary malicious code.

Images remain local. Generated text can contain sensitive inscriptions: all
stdout, stderr, and metrics go into git-ignored `private-results/`. Do not commit
photos, raw model replies, paths revealing customers, or serial numbers.
Delete this directory after reviewing a run. A production app must not retain
these debug outputs. The timeout kills and waits for the worker; no recognition
context carries over into the next run.

The catalogue prompt limits the worker to design suggestions. `identity_gate.py`
enforces this response schema and never produces holding specifications. A
caller must apply the gate to model output, keep independent OCR/catalogue data
separate, and prevent stale or mixed-item evidence from entering a scan.

## Release gates

The model and visual projector total 1,552,463,168 bytes. CPU results from this
Linux machine are not measurements of iPhone Metal performance.

Do not enable this in production until all of the following are demonstrated:

- Exact product matching against a bounded catalogue, with unsupported or
  ambiguous artwork rejected. A generic family description is insufficient.
- Front/back evidence combined within one scan, with metal, weight and year
  traceable to legible markings or a verified catalogue profile. Model-generated
  confidence and guesses must not silently fill fields.
- Negative, blurry, fractional-weight, unrelated-object and conflicting-side
  cases do not create holdings or invent specifications.
- Real-device memory, latency, heat, cancellation and repeated-scan tests pass
  on the oldest supported iPhone. Fresh scan identifiers discard late results;
  canceled workers release image and model contexts.
- An end-to-end test confirms the holding form receives validated fields and
  failed scans retain a useful review state instead of opening a blank form.
- Airplane-mode recognition works with bundled assets, and a clean installation
  uses Benza-controlled assets without relying on upstream availability.

The llama.cpp release has an Apple XCFramework with multimodal headers, but this
experiment has not compiled a native iOS integration or validated a phone build.

## Sources and notices

- Model: https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct-GGUF/tree/52d6c8ffea26cc873ac5ad116f8631268d7eb503
- Runtime: https://github.com/ggml-org/llama.cpp/tree/7fe450e19305b828c199d602c23a8337aaa1f03b
- Apache license: https://www.apache.org/licenses/LICENSE-2.0
- Runtime copyright and MIT license: `licenses/llama.cpp-MIT.txt`

The quantized model is an unmodified upstream download. The prompt and benchmark
are Benza experiment files. No customer image is included in this experiment.
