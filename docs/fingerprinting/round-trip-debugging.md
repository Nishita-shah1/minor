# TrustMark round-trip debugging

2026-09-25. **Local debugging milestone only. Ticket 1 remains incomplete.**

## Cause and change

The old `trustmark-q-lab-v1` encoder failed before screenshots: exact marked pixels returned `NO_RELIABLE_MARK`. CPU inference on identical inputs recovered the payload. Diagnostic layer outputs isolated the first divergence to `/pre/conv/Conv`, a convolution over six concatenated channels:

- With a diagnostic FP32 graph, payload expansion, nearest resizing, activation and concatenation matched CPU exactly. The first convolution had mean absolute error 0.10928514 and maximum error 0.9402569.
- FP32 conversion and NHWC selection did not restore recovery; neither is shipped.
- Routing **only** that first convolution to CPU/WASM restored recovery. This was a diagnostic, not a shipped fallback.
- A GPU graph rewrite restored recovery without that CPU override. The unchanged six-channel weight tensor is split along input channels into two three-channel convolutions. Their outputs are summed; the bias is applied exactly once. No weights are trained or adjusted.

This resembles the upstream [ONNX Runtime six-channel convolution report](https://github.com/microsoft/onnxruntime/issues/29651). Our experiment isolates the affected operation on this machine; it does not establish the underlying kernel defect or behavior on every GPU.

`scripts/trustmark-split-convolution.mjs` performs the deterministic build-time rewrite using the parser included with pinned ORT 1.30.0. Asset preparation verifies the original **and** derived hashes. The encoder remains on the WebGPU execution provider; no forced CPU node or automatic WASM fallback was added. Existing ORT graph bookkeeping may still execute outside GPU kernels.

The new, still-unqualified profile is `trustmark-q-lab-v2`. Its manifest pins the derived encoder, original source, derivation version and unchanged decoder. The old manifest remains in `lib/fingerprint/trustmark/profiles/trustmark-q-lab-v1.json`; old assets are not overwritten. No production profiles have been issued.

## Recorded result

One public synthetic 768×1024 document, payload `0123456789`, strength 1.0. Linux, AMD RDNA-3, headed Chrome **154.0.8037.57**, viewport 1400×1400, reported DPR approximately 1. Diagnostic Vulkan flags remain necessary on this machine.

| Check | Result | Scope |
|---|---|---|
| Original/derived CPU graph equivalence | PASS | White, black, seeded RGB tensors; maximum absolute difference 0.00000160933, below declared 0.00002 tolerance |
| Official Python → official Python | PASS | Unmodified pinned Adobe Python source, Q/BCH_SUPER |
| Official Python PNG → browser | PASS | Exact 40-bit identifier |
| Browser exact marked pixels → browser | PASS | Three separate encode/decode repetitions |
| Browser PNG export → browser | PASS | Exact identifier, zero corrected bits |
| Browser screenshot → browser | PASS | Native, 75%, 50%, JPEG85, 50%+JPEG85; counts 1 correct / 0 misses / 0 wrong in each cell |
| Browser PNG → official Python | PASS | Exact identifier and schema 0 |
| Browser screenshot → official Python | PASS | Exact identifier and schema 0 |
| Unmarked public fixture | PASS, limited | No valid identifier; one distinct negative input |
| Unit/lint/types/build | PASS | 53 unit tests; ESLint, TypeScript and production build |
| Held-out documents, crops, 200 negatives | NOT RUN | Still required by ticket 1 |
| Human readability and blind demonstration | NOT RUN | Still required |
| Phone photographs | NOT RUN | Intentionally blocked |

Raw reports are in `evidence/2026-09-25-roundtrip/`. They include model/image hashes. Repetitions and transformed versions of the same fixture are not independent captures. These results do not freeze a passing production profile, demonstrate 100% general screenshot recovery, or authorize integration.

The pinned Rust CLI recovered its own BCH_SUPER output, but rejected a browser PNG accepted by official Python. Its byte-aligned padding differs from the chosen Python packet reference. Rust interoperability is **not** claimed; the successful independent reference here is unmodified Adobe Python.

## Reproduce

Prepare the browser artifacts and run the standalone harness:

```bash
npm run fingerprint:assets
FINGERPRINT_HEADED=1 FINGERPRINT_VULKAN=1 npm run fingerprint:smoke
```

The harness now stops before downstream stages if exact-memory or PNG recovery fails. It records three encode/decode repetitions, then exports PNG, then captures the actual visible canvas. The decoder receives pixels only. Its negative control rejects **any** valid identifier, not just the expected identifier.

For the independent reference, use a temporary checkout of Adobe revision `2ecb73ad28d1a3f66ac9dc19e1b667711f14314f` and a disposable Python 3.12 environment. Install CPU `torch==2.14.0+cpu` and `torchvision==0.29.0+cpu` from the official PyTorch CPU index, then install that checkout's `python/` package. Recorded Pillow version: 12.3.0. The probe checks Adobe's main Python source hash and leaves its encode/decode implementation unchanged. Its first run downloads public Adobe checkpoints; image processing remains local.

```bash
# Run with that environment's Python executable.
python scripts/fingerprint-reference.py \
  --original test-results/fingerprint-smoke/strength-1/unmarked-fixture.png \
  --output test-results/fingerprint-reference

FINGERPRINT_HEADED=1 FINGERPRINT_VULKAN=1 \
FINGERPRINT_REFERENCE_PNG=test-results/fingerprint-reference/upstream.png \
npm run fingerprint:smoke

python scripts/fingerprint-reference.py \
  --original test-results/fingerprint-smoke/strength-1/unmarked-fixture.png \
  --output test-results/fingerprint-reference \
  --evidence test-results/fingerprint-smoke/strength-1/marked-pixels.png \
  --evidence test-results/fingerprint-smoke/strength-1/marked-screenshot.png
```

Optional independent graph-equivalence probe uses Python ORT 1.30.0 and NumPy 2.5.3:

```bash
python scripts/fingerprint-model-parity.py \
  --original /path/to/hash-verified/encoder_Q.onnx \
  --derived public/fingerprint-assets/trustmark-q-lab-v2/encoder_Q_split3.onnx \
  --output test-results/fingerprint-reference/model-parity.json
```

Python and Rust are local diagnostic tools only. They are not added to the deployed application. No sharing, Scan, database, or deployment changes belong to this milestone.
