# DenseCrop: multi-scale crop ranking beside TrustMark

**Date:** 2026-09-26

**Status:** Design approved. Not implemented. Experimental and unqualified.

**Scope:** One local forensic layer added beside the existing TrustMark pipeline. This spec does not replace `docs/superpowers/specs/2026-09-25-webgpu-fingerprinting-design.md` and does not change TrustMark’s BCH packet, ONNX models, or exact-ID contract.

## Problem

TrustMark Q recovers a copy identifier from large captures. Adobe’s published guidance treats TrustMark as reliable down to about a 150 px shortest side, and its crop tests are on the order of 20% area loss. EchoLeaks lab evidence matches that limit: full-page synthetic cases passed, while many half-page and edge crops did not. A very small screenshot does not contain enough invisible capacity for a repeated 100-bit packet.

DenseCrop makes a recipient-specific signal present across the rendered page so a small crop can still be compared with known copies. Weak evidence stays unnamed.

## Product meaning

A result names a **distributed copy**, not a person who pressed a screenshot button and not a calibrated chance that they leaked the document.

Scanner outcomes:

| Verdict | When | What the owner sees |
| --- | --- | --- |
| Exact match | TrustMark returns one valid identifier that matches one owned copy | Existing 100% ring. Identifier equality only. |
| Probable match | TrustMark has no unique id, and DenseCrop clears the floors below | Named copy, top-5 relative scores, usable-region count, leader margin |
| Inconclusive | DenseCrop has usable regions, but the floors fail, or page hypotheses disagree | Top-5 shortlist, no highlighted winner, no named copy |
| No reliable mark | TrustMark has no id and DenseCrop has no usable region | No shortlist and no name |
| Unknown mark | TrustMark returns a valid id that matches none of the loaded copies | Existing unknown-mark copy. DenseCrop does not override it |

Relative scores are normalized correlations in `[-1, 1]`. The UI may also show `round(score * 100)` as `N/100` with the label **relative forensic score — not a probability**. Softmax, “93% likely,” and “estimated match confidence” are out of scope until a separate calibration set exists.

## Architecture

```text
clean local pixels
    -> TrustMark encode (unchanged)
    -> DenseCrop multi-scale field
    -> marked pixels shown only if both steps succeed

screenshot pixels stay in the browser
    -> TrustMark decode
         unique owned id -> exact match, stop
         otherwise -> DenseCrop rank
              floors pass -> probable match
              usable but weak, or conflicting pages -> inconclusive shortlist
              no usable regions -> no reliable mark
```

TrustMark decode still receives pixels only. Candidate secrets are used only by DenseCrop. No pixels, secrets, residuals, or scores are uploaded. No new database column, envelope, or `profileId`. Stored fingerprints remain `trustmark-q-lab-v2`. The same 32-byte copy secret and document id drive the carrier.

If TrustMark encode or DenseCrop encode fails, the protected viewer stays covered. A TrustMark-only image is not shown.

Supported surfaces stay PDF pages and static PNG/JPEG.

## Carrier

For each rendered pixel, after TrustMark:

```text
marked = clamp(trustmarkPixel + strength(content) * recipientCarrier(x, y), 0, 255)
```

`recipientCarrier` is bipolar in `[-1, 1]`. It is a structured field, regenerable without the original pixels. It is not independent noise and it is not a BCH payload.

Seed, domain-separated:

```text
EchoLeaks/dense-crop/v1 || fingerprintSecret || documentId || page || scale || tileX || tileY || phase
```

- PNG/JPEG uses page `1`.
- PDF uses the rendered page index, starting at `1`.
- Carrier periods: `32`, `64`, and `128` px.
- Encode phases: `0` and half the period. Both are summed into that scale’s field.
- Tile coordinates repeat the block across the page.

The same offset is added to R, G, and B. `strength(content)` uses the local standard deviation of luminance. Below `8` (0–255 scale) the strength is `0` and that region is unusable. Otherwise strength rises with variance and is capped at `3` code values. A local standard deviation of `32` maps to that cap. If the negative smoke names any recipient, lower the cap until it does not. Do not lower the match floors to make a strength pass.

## Detection

The detector does not need clean original pixels. It regenerates each candidate field from the owner-unwrapped secret.

One alignment hypothesis is shared by every candidate. A hypothesis is a capture scale, a page, and one phase fraction. That fraction is applied to every carrier period the scaled evidence can hold, and the patches from those periods are pooled into one median. A candidate must not choose its own best shift.

Search lattice:

- Capture scales: `0.75`, `1`, and `1.25`, applied to the evidence before correlation.
- Carrier periods scored only when the evidence short side can hold that window: `32` when the short side is at least `32`, `64` from `64`, `128` from `128`.
- Detect phases: `0`, `0.25`, `0.5`, and `0.75` of the period being scored.
- Patches are windows of that period, stride half the period. The usable set is chosen from the evidence only: a patch whose luminance standard deviation is under `8` is dropped for every candidate.
- Each usable patch is mean-centered. Its score is the normalized correlation of that centered luminance with the mean-centered carrier, in `[-1, 1]`. There is no clean-original residual.
- The candidate score for a hypothesis is the median of those patch scores. Usable-region count is the size of that shared patch set.

Page search:

- Use the owner-selected original page when one is loaded.
- Otherwise PNG/JPEG is page `1`.
- A PDF screenshot without a selected page searches `1..min(32, pageCount)` when a local original supplied the count, and `1..32` when it did not.

A hypothesis is a probable-match candidate only when all three floors hold: median correlation `>= 0.60`, leader median minus runner-up median `>= 0.20`, and usable regions `>= 8`. If every passing hypothesis names the same copy, that copy is the probable match, taken from the passing hypothesis with the largest margin. If two passing hypotheses name different copies, the verdict is inconclusive. If none pass, and at least one hypothesis has a usable region, the verdict is inconclusive and the shortlist comes from the hypothesis with the largest margin, showing at most five scores and no winner. Zero usable regions and no TrustMark id is no reliable mark.

## WebGPU

DenseCrop runs in its own worker, not the TrustMark ONNX worker. The worker uses `navigator.gpu.requestAdapter`, `requestDevice`, a compute pipeline, storage buffers, and `dispatchWorkgroups` for embed and correlation. The margin rule, page cap, and verdict stay on the CPU. Missing WebGPU uses the same reference math in that worker. Do not use `createBufferMapped`.

## UI

Scan and the fingerprint lab use the existing neobrutalist tokens: cream, yellow, black, thick borders, hard offset shadows, `rounded-xl` panels, `rounded-full` controls.

Exact match keeps the current ring. Probable match names the leading copy and shows the shortlist, region count, and margin. Inconclusive shows the shortlist and the sentence that no copy is named. Both states include: this suggests a displayed copy, and the score is not a probability. The viewer says the fingerprint is experimental and that crop ranking is unqualified.

## Tests and claims

Unit tests cover carrier regeneration, the variance floor, shared-hypothesis scoring, the three dense verdicts, and rejection of a highest-but-close score.

The implementation smoke gate is 200 synthetic negatives plus small-window crops and light JPEG. Negatives must name no recipient. Misses are recorded. This smoke is not screenshot, phone-photo, or format-wide qualification.

Later targets, not this implementation: at least 1,000 negatives before any demo reliability claim, and about 10,000 transformed negatives before the 100-candidate search is treated as characterized. Human readability review is not part of this spec. Calibration from scores to an error rate is a separate future spec.

## Files

- New `lib/fingerprint/dense/` for the profile, carrier, strength, correlation, and verdict.
- New `workers/dense-fingerprint.worker.ts`.
- New Scan components for the probable match and the unnamed shortlist.
- Edit the protected viewer, `lib/fingerprint/lab/investigate.ts`, Scan, the fingerprint lab, and the worker client.
- Leave `lib/fingerprint/trustmark/bch.ts` unchanged.
- Update `ARCHITECTURE.md` and `memory/memory.md` when the code lands.
