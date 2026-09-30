# Candidate evaluation — 2026-09-30

**Decision: reject this candidate for production scanner use.**

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
