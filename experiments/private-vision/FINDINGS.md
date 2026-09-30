# Candidate evaluation — 2026-09-30

**Decision: reject free-form specification generation. Catalogue-only design
suggestions remain experimental, with production integration disabled.**

Tested the pinned Qwen3-VL-2B-Instruct Q4_K_M model with llama.cpp b11146,
CPU execution, four threads, temperature zero and 1,024 maximum image tokens.
Recognition ran with IP sockets blocked. No customer photos were transmitted
to a model service. Customer photos and raw outputs are excluded from this repo.

| Input case | Observed result | Assessment |
| --- | --- | --- |
| Maple Leaf inscription side | Read silver and 1 oz; returned a generic Canadian bullion family | Useful inscription recognition; exact product identification incomplete |
| American Silver Eagle obverse dated 2011 | Recognized Eagle artwork and year; invented a 20 oz weight and reported no uncertain fields | Critical failure: unsupported, incorrect specification |
| Generic round artwork side with no readable specifications | Invented silver, 10 oz, a 2023 year and a nonexistent weight inscription | Critical failure: fabricated evidence as well as specifications |

The Eagle test took 97.34 seconds including startup and generation. Peak child
resident memory was 3,151,668 KiB (about 3.01 GiB). This Linux CPU measurement
does not establish performance on iPhone/Metal, but the memory and 1.55 GB model
assets already impose a substantial integration cost. The unmarked-round test
took 81.43 seconds and peaked at 3,151,736 KiB resident memory.

The model prompt explicitly required metal and weight to come from readable
markings, unknown values to be null, and unsupported facts not to be invented.
The wrong weight therefore demonstrates why prompt instructions and a model's
uncertainty output cannot be trusted as validation.

No app scanner implementation was changed by this experiment. It is not a
replacement for an actual iPhone camera, front/back lifecycle, or holding-form
handoff test. No native build or launch-readiness claim is made.

## What this establishes

Fixed local weights and an open runtime can operate without a hosted API,
subscription check, model-provider account, or automatic update. That is a
viable way to remove provider pricing and service-policy dependencies, subject
to license compliance and retaining our own distribution copies. It does not
make this model accurate enough for bullion.

The next implementation should use visual recognition to suggest a bounded
catalogue identity, then independently validate specifications against readable
front/back markings and catalogue data. Arbitrary model-generated weights must
never populate holdings. A dedicated catalogue image matcher/classifier may
offer a smaller local solution, but requires licensed reference images and a
representative test set; its accuracy is not established by this experiment.

## Catalogue-only follow-up

Tested the same fixed model with `catalogue-prompt.txt`, which asks for only one
supported design ID or `unknown`. It does not ask the model to transcribe text or
generate metal, weight, year, or confidence.

| Input case | Design response | Assessment |
| --- | --- | --- |
| Eagle obverse | `american_eagle` | Correct design suggestion |
| Maple Leaf reverse | `canadian_maple_leaf` | Correct design suggestion |
| Unmarked generic round | `unknown` | Correct rejection of unsupported design |
| App screenshot, no physical coin | `unknown` | Correct rejection of a non-coin image |

The Eagle run took 80.24 seconds. The Maple and round runs took 90.89 and 86.09
seconds while run concurrently on the same Linux CPU. Peak resident memory
remained about 3.01 GiB per worker. These timings are not directly comparable to
one another or to iPhone GPU execution. The non-coin test took 68.10 seconds.

`identity_gate.py` permits exactly one known design ID, rejects extra fields,
duplicate keys, malformed responses and unsupported IDs, and blocks conflicting
front/back identities. Every accepted result explicitly has
`can_create_holding: false`; specifications require an independent data source.
Seven regression tests pass, including rejection of the original wrong-weight
response shape. These protocol tests do not validate image-recognition accuracy.

This small sample is promising for bounded suggestions, but does not establish
general accuracy. Confusable bullion, replicas, gold commemoratives sharing
artwork, blurred images and supported-device performance still require testing.
No holding data or app camera behavior changed.

## Lower-detail catalogue follow-up

Reduced image tokens from 1,024 to 256, context size from 4,096 to 1,024, and
maximum generated tokens to 64. The catalogue-only task identifies broad artwork,
not fine inscriptions; these settings must not be reused for specification OCR.
Ran the four cases sequentially with independent workers and network blocked.

| Case | Design response | Total seconds | Peak child RSS KiB |
| --- | --- | ---: | ---: |
| Eagle | `american_eagle` | 22.19 | 2,535,984 |
| Maple | `canadian_maple_leaf` | 19.40 | 2,535,552 |
| Unsupported round | `unknown` | 17.53 | 2,535,468 |
| Non-coin screenshot | `unknown` | 19.26 | 2,531,164 |

All four responses passed the strict identity gate. Correct outcomes on these
four examples are encouraging, but are not an accuracy estimate for customer
photos. Model files remain 1.55 GB and peak resident memory is still about
2.42 GiB on Linux. No iPhone inference, native Metal timing, jetsam limit, or
shipping integration has been validated.

## Portable native core

Implemented `NativeCore` around the pinned runtime's C APIs. It accepts decoded
RGB pixels and verified local model paths, loads fresh model/vision/context state
per worker, serializes inference with a try-lock, and uses single-use scan handles.
All inference allocations have scoped destructors. Cancel and timeout checks run
through loading and decoding and before publishing the reply. GPU work cannot be
assumed immediately preemptible: a canceled worker must finish cleanup before a
new worker can start. Busy calls are rejected instead of queued.

Compiled the C++ core on Linux with warnings treated as errors. A real-image
native benchmark, with networking blocked, confirmed:

- An active worker rejects another inference request before loading more models.
- A running handle cannot be destroyed.
- Cancellation publishes no reply, and the handle can be cleaned up afterward.
- A new worker after cancellation recognizes the Eagle correctly.
- A completed handle cannot be reused for another image.

The fresh Eagle run took 23.95 seconds and peaked at 2,541,104 KiB process RSS.
This is a native Linux test, not an iPhone test. The package includes a strict
Swift design-response boundary and Apple compile/test workflow; their successful
execution must be confirmed separately. Model results still cannot create a
holding, and the shipping app target is not connected to this experiment.

A same-process sequence after cancellation returned Eagle, unknown for the
unsupported round, then Eagle again. The three runs took 27.79, 19.03 and 21.60
seconds. Process peak RSS stayed at 2,542,544 KiB throughout this sequence;
the later runs did not raise the recorded memory peak. This is a short lifecycle
check, not proof against leaks over unlimited scans.

The first Apple workflow compiled the C++ core and Swift parser on arm64 macOS
and passed all three Swift boundary/lifecycle tests. Its iOS step failed because
the package's auto-generated scheme name differed from the product name. The
workflow now discovers the available package scheme instead of assuming it.
Physical iPhone inference and end-to-end camera/holding behavior remain untested.
