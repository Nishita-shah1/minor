# DenseCrop: multi-scale crop ranking beside TrustMark

**Date:** 2026-09-26

**Status:** Revised after review. Not implemented. Experimental and unqualified.

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

TrustMark decode still receives pixels only. Candidate secrets are used only by DenseCrop. No pixels, secrets, residuals, or scores are uploaded. The same 32-byte copy secret and document id drive the carrier. There is no new database column and no migration. The existing `profile_id` text, and the same field inside invitation JSON, stores both versions for new copies:

```text
trustmark-q-lab-v2+densecrop-v1
```

That token means `trustmarkProfile: trustmark-q-lab-v2` and `denseProfile: densecrop-v1`. The TrustMark id stays `trustmark-q-lab-v2` so current ONNX assets and already issued rows keep their name. A legacy value of `trustmark-q-lab-v2` alone is TrustMark only: the scanner does not guess a dense version. Any other dense token is unavailable, and v1 math is not run against it. TrustMark still runs when its own token is known.

If TrustMark encode or DenseCrop encode fails, the protected viewer stays covered. A TrustMark-only image is not shown.

Supported surfaces stay PDF pages and static PNG/JPEG.

## Carrier

For each rendered pixel, after TrustMark:

```text
marked = clamp(trustmarkPixel + strength(content) * recipientCarrier(x, y), 0, 255)
```

`recipientCarrier` is bipolar in `[-1, 1]`. It is a structured field, regenerable without the original pixels. It is not independent noise and it is not a BCH payload. The same block repeats at every tile of that scale. Absolute `tileX` and `tileY` are not part of the seed, so a crop from anywhere on the page is aligned by scale and phase only. A later super-grid may add spatial diversity; v1 does not.

The block key is HMAC-SHA-256 over UTF-8 fields separated by NUL:

```text
HMAC(fingerprintSecret,
  "EchoLeaks/dense-crop/v1" || NUL || documentId || NUL || page || NUL || scale || NUL || phase)
```

Counter blocks `HMAC(key, message || counter)` fill one period. Each byte’s high bit maps to `+1` or `-1`. That block is repeated across the page.

- PNG/JPEG uses page `1`. PDF uses the rendered page index, starting at `1`.
- Carrier periods: `16`, `32`, `64`, and `128` px. The 16 px field is the lightest, 32 px is the strongest, and 64/128 sit between them.
- Embedded phase tags: `0` and `half`. Tag `half` is a second block, added at a half-period offset. The detector slides the summed field. It does not search a tile index.

The same offset is added to R, G, and B. Amplitude follows local luminance standard deviation: below 8 the floor is ±1, then ±3, and the cap is ±4. ±6 and ±8 stay off until a tune set shows they still leave TrustMark's exact id intact. A public sync pilot, not derived from the recipient secret, is mixed in only to recover scale and x/y phase. It is not identity evidence. Flat paper stays within about one code value. If a negative sample names any recipient, lower the cap. Do not lower the match floors to make a strength pass.

## Detection

The detector does not need clean original pixels. It regenerates each candidate field from the owner-unwrapped secret.

One alignment is shared by every candidate. The public pilot chooses the capture scale and the x/y phase. Every recipient is scored at that frozen alignment. A candidate must not choose its own best shift. Scores stay raw correlations. The UI may show `max(0, correlation) × 100` as `N/100` and must not treat that as a probability. Rank #1 stays unnamed when the 0.60 floor fails.

Search lattice:

- Capture scales: `0.75`, `1`, and `1.25`, applied to the evidence before correlation.
- Carrier periods scored only when the evidence short side can hold that window: `32` when the short side is at least `32`, `64` from `64`, `128` from `128`.
- Detect phases: `0`, `0.25`, `0.5`, and `0.75` of the period being scored.
- Patches are windows of that period, stride half the period. The usable set is chosen from the evidence only: a patch whose luminance standard deviation is under `8` is dropped for every candidate.
- Correlation uses a normalized residual, never raw luminance. Document text is stronger than a ±3 code-value carrier, so each patch is filtered before the dot product:
  1. Luminance `Y = 0.2126 R + 0.7152 G + 0.0722 B`.
  2. High-pass: `Y` minus its 5×5 box mean.
  3. Local contrast: divide by the local standard deviation over a window of `max(5, period / 4)`, with epsilon `1` in code-value units.
  4. Mean-center that residual and L2-normalize it. L2-normalize the aligned carrier. The patch score is their dot product, in `[-1, 1]`.
- The candidate score for a hypothesis is the median of those patch scores. Usable-region count is the size of that shared patch set. Phase search is only the offset lattice inside the repeating period. It is not a search for where the crop sat on the page.

Page search:

- Use the owner-selected original page when one is loaded.
- Otherwise PNG/JPEG is page `1`.
- A PDF screenshot without a selected page searches `1..min(32, pageCount)` when a local original supplied the count, and `1..32` when it did not.

Starting floors are experimental defaults, not a calibrated operating point: median correlation `>= 0.60`, leader median minus runner-up median `>= 0.20`, and usable regions `>= 8`. A tuning split may replace those three numbers. The held-out split must not be used to choose them. Until a recorded tuning run freezes replacements, the defaults stay in force and the UI keeps calling them experimental.

If every passing hypothesis names the same copy, that copy is the probable match, taken from the passing hypothesis with the largest margin. If two passing hypotheses name different copies, the verdict is inconclusive. If none pass, and at least one hypothesis has a usable region, the verdict is inconclusive and the shortlist comes from the hypothesis with the largest margin, showing at most five scores and no winner. Zero usable regions and no TrustMark id is no reliable mark. An inconclusive crop is a successful abstention, not a miss to be repaired by naming the highest score.

## WebGPU

DenseCrop runs in its own worker, not the TrustMark ONNX worker. The worker uses `navigator.gpu.requestAdapter`, `requestDevice`, a compute pipeline, storage buffers, and `dispatchWorkgroups` for embed and correlation. The margin rule, page cap, and verdict stay on the CPU. Missing WebGPU uses the same reference math in that worker. Do not use `createBufferMapped`.

## UI

Scan and the fingerprint lab use the existing neobrutalist tokens: cream, yellow, black, thick borders, hard offset shadows, `rounded-xl` panels, `rounded-full` controls.

Exact match keeps the current ring. Probable match names the leading copy and shows the shortlist, region count, and margin. Inconclusive shows the shortlist and the sentence that no copy is named. Both states include: this suggests a displayed copy, and the score is not a probability. The viewer says the fingerprint is experimental and that crop ranking is unqualified.

## Tests and claims

Unit tests cover carrier regeneration, identical blocks at two tile origins, the variance floor, residual correlation rather than raw luminance, shared-hypothesis scoring, the three dense verdicts, and rejection of a highest-but-close score.

One regression is mandatory and fails the suite if it breaks: a clean page is TrustMark-encoded, then DenseCrop-encoded, then passed to the TrustMark decoder as a full-page screenshot. The decoder must return the same identifier it would have returned without DenseCrop. DenseCrop must not buy crop ranking by destroying exact full-page recovery.

The tuning matrix, split into a tune set and a disjoint held-out set, is:

- Crop sizes `128×128`, `96×96`, `64×64`, `48×48`, and `32×32`, taken from arbitrary page positions.
- 100 candidate identities.
- JPEG, resize, and brightness/contrast.
- Unrelated negatives, including unmarked pages and wrong-document crops.

Floors move only from the tune set. Held-out crops report correct probable matches, abstentions, and wrong names separately. A `32×32` or other tiny crop that returns inconclusive passes the abstain rule. The first smoke gate is still 200 synthetic negatives, and those negatives must name no recipient. That smoke, and even a finished held-out run, is not screenshot, phone-photo, or format-wide qualification.

Later targets, not a claim this spec completes: at least 1,000 negatives before any demo reliability claim, and about 10,000 transformed negatives before the 100-candidate search is treated as characterized. Human readability review is not part of this spec. Calibration from scores to an error rate is a separate future spec.

## Files

- New `lib/fingerprint/dense/` for the profile, carrier, strength, correlation, and verdict.
- New `workers/dense-fingerprint.worker.ts`.
- New Scan components for the probable match and the unnamed shortlist.
- Edit the protected viewer, `lib/fingerprint/lab/investigate.ts`, Scan, the fingerprint lab, the worker client, and the existing `profileId` writers and parsers (`lib/fingerprint/copy-secret.ts`, share validators, invitation JSON). No Drizzle migration.
- Leave `lib/fingerprint/trustmark/bch.ts` unchanged.
- Update `ARCHITECTURE.md` and `memory/memory.md` when the code lands.
