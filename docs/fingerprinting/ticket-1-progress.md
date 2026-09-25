# Ticket 1: implementation checkpoint

Date: 2026-09-25. **INCOMPLETE. No qualified profile. Tickets 2–8 have not started.**

The user explicitly requested coding after the design-review pause. The first implementation is an isolated development lab; existing sharing, access policy, database schema, and Scan remain unchanged.

## Latest debugging checkpoint

The first-convolution WebGPU discrepancy is now isolated and worked around with a hash-pinned, GPU-only graph rewrite in experimental profile `trustmark-q-lab-v2`. Official Python interoperability, three exact-memory repetitions, PNG export and five screenshot smoke cases passed on one public fixture. See [round-trip debugging](round-trip-debugging.md) for evidence, commands and limitations. This is not held-out qualification; sharing and Scan remain blocked.

The initial v1 measurements below are retained as historical evidence, not the current v2 result.

## Implemented

- `lib/fingerprint/trustmark/engine.ts`: pinned ONNX Runtime Web 1.30.0, model checksum verification, dedicated WebGPU device, lazy encoder/decoder initialization, disposal and GPU-loss handling.
- `workers/fingerprint.worker.ts` and `lib/fingerprint/worker-client.ts`: one operation at a time, cancellation, bounded timeout, stale-response rejection and transferable marked output.
- `lib/fingerprint/trustmark/bch.ts`: BCH_SUPER packet construction/correction, verified against 12 Adobe Python golden vectors and 960 seeded error-correction cases. Five payload bytes, seven parity bytes, four zero schema bits; no extra padding byte.
- `lib/fingerprint/identity.ts`: domain-separated document/secret derivation and exact, unique candidate resolution. This is not connected to server records.
- `lib/fingerprint/trustmark/pixels.ts`: bounded private pixel preprocessing, alpha flattening, half-pixel bilinear resizing, residual scaling, clipping and quantization.
- `/fingerprint-lab`: development-only PDF first-page/image loading, public synthetic fixture, strength controls, completed marked canvas and independent evidence decoding. No expected identifier is passed to the decoder.
- `scripts/prepare-fingerprint-assets.mjs`: hash-pinned model downloads and matching local runtime assets. Large assets are ignored by Git. Runtime files include 1.30.0's asyncify variant, which actual browser execution required.
- `scripts/fingerprint-smoke.mjs`: isolated local browser harness using the same worker, real visible-canvas screenshots, five transformation cases, and an unmarked control.

## Run locally

```bash
npm ci
npm run fingerprint:assets
npm run dev
```

Open `/fingerprint-lab` in a desktop browser with a working WebGPU `shader-f16` device. The page returns not-found outside development. Use non-confidential fixtures. No inference service is deployed.

The standalone smoke test avoids app authentication and does not modify it:

```bash
npm run fingerprint:smoke
```

This Linux machine required explicit diagnostic Vulkan flags to expose the AMD adapter instead of SwiftShader:

```bash
FINGERPRINT_HEADED=1 FINGERPRINT_VULKAN=1 FINGERPRINT_STRENGTH=1 npm run fingerprint:smoke
```

These flags are recorded in the report; they do not establish support for default Chrome configurations. Optional strengths are `0.8`, `1`, `1.25`, `1.5`. Results and public fixture images are written to `test-results/fingerprint-smoke/strength-<value>/`. A failed recovery exits nonzero. This harness is a tuning experiment, not the held-out evaluation.

## Initial v1 checks

| Check | Status | Evidence / limitation |
|---|---|---|
| Unit suite | PASS | 53 tests across 12 files, including worker cancellation and cleanup contracts |
| TypeScript | PASS | `npx tsc --noEmit` |
| ESLint | PASS | Generated model runtime and smoke bundles excluded |
| Production build | PASS | `npm run build`; no database migration |
| Model downloads | PASS | Exact byte lengths and SHA-256 checked against manifest |
| Python ECC compatibility | PASS | Twelve golden packets and seeded correction cases; provenance in fixture JSON |
| CPU model diagnostic | PASS, limited | Production TypeScript preprocessing/BCH/compositor with published ONNX models executed by Python CPU ORT recovered `0123456789`, zero corrected bits, on synthetic pixels. This is not Adobe PyTorch/browser interoperability qualification. |
| Default browser WebGPU | BLOCKED | Chrome selected SwiftShader without shader-f16 and correctly rejected initialization |
| AMD WebGPU inference | PASS, limited | Encode/decode executed using Chrome 154.0.8037.57 on Linux with explicit Vulkan flags; adapter reports AMD RDNA-3 |
| Screenshot tuning smoke | FAIL | Every positive transformation missed at all four tested strengths; see counts below |
| Next development page interaction | BLOCKED | Requests to both homepage and lab timed out; standalone worker harness ran. Cause not established; auth was not bypassed. |
| Full cross-implementation image parity | NOT RUN | A successful CPU diagnostic is insufficient; GPU/reference discrepancy remains unresolved |
| Held-out PDF matrix and crop reconstruction | NOT RUN | Alignment/reconstruction UI and independent evaluation corpus are not implemented yet |
| 200 negatives / candidate-count matrix | NOT RUN | Only one unmarked synthetic control per tuning run |
| Human readability / blind demonstrations | NOT RUN | Requires independent reviewers and participants |
| Physical photographs | NOT RUN | Blocked by screenshot milestone |
| Lifecycle/privacy/performance qualification | NOT RUN | Unit contracts and smoke timings are not product qualification |

## Initial v1 failed tuning measurements

One synthetic 768×1024 canvas fixture, identifier `0123456789`, DPR 1, viewport 1400×1400. Each strength was encoded independently. Transformations use Chromium canvas resizing with smoothing enabled and quality `high`; JPEG requests use `image/jpeg`, quality `0.85`, and verify the returned MIME type. This is **not** ten held-out PDFs, multiple recipient patterns, or independent captures for every transform.

Each cell below is **correct / misses / wrong**:

| Strength | Native | 75% (576×768) | 50% (384×512) | JPEG85 | 50% + JPEG85 |
|---|---|---|---|---|---|
| 0.8 | 0/1/0 | 0/1/0 | 0/1/0 | 0/1/0 | 0/1/0 |
| 1.0 | 0/1/0 | 0/1/0 | 0/1/0 | 0/1/0 | 0/1/0 |
| 1.25 | 0/1/0 | 0/1/0 | 0/1/0 | 0/1/0 | 0/1/0 |
| 1.5 | 0/1/0 | 0/1/0 | 0/1/0 | 0/1/0 | 0/1/0 |

Every positive returned `NO_RELIABLE_MARK`. The repeated unmarked control also returned `NO_RELIABLE_MARK`; it is one distinct negative input, not four independent negative tests. Raw reports are retained under `evidence/2026-09-25/`. They contain local hardware diagnostics and public fixture identifiers, not feature activity records or private documents.

The CPU path recovered a synthetic mark while the GPU output failed reference decoding in a diagnostic. Disabling ONNX graph optimizations did not fix the GPU smoke failure and was reverted. Canvas screenshots also differed from `toDataURL` pixel exports; their effect requires investigation. Neither observation identifies the root cause conclusively.

## Next engineering step

Repeat preliminary recovery on representative PDFs and recipient identifiers with the new profile, then implement and prove crop reconstruction. Readability review is still required before freezing a profile and running fresh held-out evaluation. Do not enable sharing or Scan on the basis of the synthetic smoke fixture.

The marked working surface remains bounded to 4 megapixels and aspect ratios from 1:2 through 2:1. PNG/JPEG originals up to 24 megapixels and 12000 pixels per side are fitted into that surface before marking; larger sources are rejected before decoding. This does not qualify screenshot recovery for every source resolution. The lab renders only PDF page 1 and uses a system font for its public synthetic tuning fixture. It is not a qualified document renderer. No immutable production profile has been issued.
