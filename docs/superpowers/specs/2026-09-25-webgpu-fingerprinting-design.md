# EchoLeaks: screenshot fingerprinting with measured recovery

Date: 2026-09-25

Status: conversational design approved; written-spec review pending.
This document specifies an experiment and its acceptance gates. No fingerprint
profile or recovery result has been validated yet.

## Baseline and execution boundary

Baseline: `b852ec4` on `main`. Work branch:
`feat/read-only-webgpu-fingerprinting`.

EchoLeaks already provides browser-local encrypted sharing through Clerk,
Neon/Drizzle, private R2, and crypto workers. The current viewer displays
decrypted image Blob URLs, the first PDF page through PDF.js 6.3.289, and
selectable text. Download-enabled shares can export original plaintext.
Scan is a placeholder; fingerprints, view sessions, and local matching do
not exist. Owner metadata/key access exists, but owner-authorized ciphertext
access for investigation must be added during integration.

Start with ticket 1. Its results determine whether integration proceeds.
Preserve the classical brightness-pattern architecture: no ML or additional
transforms. Do not weaken failed gates to start dependent work.

## 1. Goal and supported captures

Build encrypted, read-only sharing with local investigation of which
recipient's displayed copy is consistent with a supplied screenshot.
This feature does not discover leaks online or establish who intentionally
disclosed information.

Approved capture boundaries:

- **Full-page screenshots:** identifiable page corners, owner-selected
  original/page, and manual alignment. Provide **Fit page** in the viewer.
- **Partial-page screenshots:** manual corresponding points in both the
  original and screenshot, covering at least **50% of the original page
  area**. Native crops are required; resized/recompressed crops are
  experimental.
- Smaller fragments, unknown page locations, inadequate alignment, and
  insufficient signal produce an unsupported or inconclusive result.
- Phone photographs remain experimental and require physical capture tests.

These are target support conditions, not demonstrated capabilities. Final
claims must identify the conditions actually qualified by recorded tests.

Target desktop Chrome/Edge configurations with working WebGPU and fullscreen.
Required formats are all PDF pages, static PNG/JPEG, text, and CSV, introduced
incrementally. XLSX remains deferred.

Use "low-visibility fingerprint" in product copy. Explain that investigation
requires the original and its keys, and that authorized browsers receive
plaintext before marking. The feature cannot prevent deliberate clean-byte
extraction, copied/reconstructed content, or screenshot capture. Replace
existing "invisible leak attribution" and automatic-leak-discovery implications
when integrating the feature; do not claim production forensic certainty.

## 2. Fingerprint protocol and application behavior

### Reconstructable rendering

Bind each fingerprint permanently to an immutable document revision and
recipient/share identity. Replacing a document or changing its recipient
requires a new association. Never resolve an old fingerprint to a newly
assigned recipient.

Persist an immutable profile identifier resolving to:

- Renderer implementation/version and required assets.
- Canonical page dimensions, scale, font assets, and text-layout rules.
- Image orientation, color conversion, clipping, and quantization rules.
- Pattern generation, placement, strength, detector, and threshold versions.

Retain the assets and implementation needed to reconstruct issued profiles.
Never silently substitute a newer renderer. An unavailable profile produces
a reconstruction error.

Use bundled, versioned fonts for text/CSV. Pin PDF.js and its supporting
assets; normalize image orientation explicitly. Each renderer requires its
own recovery qualification. Browser/platform rendering variation belongs in
the recorded qualification matrix; a profile identifier alone does not prove
pixel equivalence across machines.

### Experimental engine

Generate a cryptographically random 128-bit seed, stable for each
document/share association. Separate opening sessions from fingerprint
identity. Seeds are pseudonymous pattern metadata, not authorization secrets;
keep them out of URLs, analytics, emails, and public logs. Recipients receive
only their own seed; owners retrieve authorized document-scoped candidates.

Implement deterministic seed expansion, repeated band-limited brightness
patterns, and canonical document coordinates. Evaluate strengths of **1, 2,
4, and 6 levels out of 255**. Derive expected residuals from actual clipped,
quantized marked pixels. Render from clean source pixels every time; never
accumulate marks on already marked output.

Use a TypeScript reference implementation and WebGPU production compositor.
Freeze the lowest profile passing both recovery and readability gates. If
none passes, stop dependent implementation and document the failure.

The pattern is matched against known candidates; it is not a self-decoding
identifier or cryptographic signature. Pattern and threshold selection must
be reproducible. Record exact parameters, test vectors, and evaluation
artifacts before declaring a profile eligible for integration.

### Protected viewer

- Check secure context, adapter/device creation, limits, and shader readiness
  before expensive document decryption/rendering. A missing adapter gets a
  compatibility message. Do not rely on `navigator.gpu` alone.
- Prepare clean pixels privately; display only completed marked output.
  Block on GPU failure or loss. There is no CPU/WebGL production compositing
  fallback; CPU parsing, pattern preparation, and reference tests are allowed.
- Request fullscreen from an explicit user action, with a loading cover during
  preparation. Preserve page and zoom across covers and re-entry. Do not trap
  Escape or repeatedly request fullscreen.
- Cover when hidden, suspended, or leaving fullscreen. On visibility
  restoration, page restoration, or resume, remain covered until fresh
  authorization succeeds; do not depend solely on timers.
- While visible, recheck approximately every 15 seconds. Cover immediately on
  authorization rejection, or after 30 seconds without confirmation.
  Distinguish revoked/expired access from temporary connectivity problems.
- Enforce effective `VIEW_ONLY` for existing shares, reject new download
  permissions, and retain database enum compatibility. Remove application
  downloads/exports and replace protected content during printing. Ciphertext
  fetching for local decryption remains necessary.
- Keep fullscreen exits as ordinary activity events. Unsupported formats have
  no download fallback. Keep navigation accessible and disclose raster-preview
  accessibility limits.

### Owner investigation

Use: **Select document → Select page → Add screenshot → Align → Analyze**.

Keep original and screenshot pixels local. Full-page alignment uses the page
corners. Partial-page alignment uses corresponding points in the reference
and capture; verify the mapped coverage before attempting attribution.

Compare normalized residual evidence against authorized candidates, with
bounded alignment refinement and unusable-region masking. Shared document
content must not count as evidence of a particular recipient.

Distinguish original-decryption failure, unavailable renderer, inadequate
alignment, insufficient signal, and no reliable match. A prerequisite failure
is not evidence that no recipient matches.

For multiple candidates, require an absolute threshold, adequate signal/
coverage, and a runner-up margin. For one candidate, use a separately
validated absolute threshold and signal/coverage checks; no synthetic infinite
margin. Without validated rules for the candidate count/profile, return
`INCONCLUSIVE`. If no fingerprints were issued, explain that no candidates
are available before analysis.

Return `CANDIDATE_MATCH`, `INCONCLUSIVE`, or `NO_RELIABLE_MATCH`, with
non-probabilistic scores and the explanation: "This suggests a source copy,
not who intentionally disclosed it."

## 3. Metadata, APIs, privacy, and lifecycle

Add concurrency-safe fingerprint issuance, separate viewing sessions, and
bounded session events. Fingerprint records preserve issued recipient identity
and profile references. Concurrent opens reuse the stable fingerprint while
creating distinct opening sessions.

Provide authenticated interfaces for:

- Recipient session issuance and access revalidation.
- Bounded, deduplicated session-event submission.
- Owner-only encrypted-original access, historical fingerprint candidates,
  and activity summaries.

Reuse verified-user, verified-email, document/share, schedule, ownership, and
status checks. Apply `no-store`, event body/batch limits, sequence deduplication,
persisted throttling, and server-bounded visible-time accounting. Do not trust
client-provided recipient identity or claimed elapsed time.

Permitted browser context is limited to:

- Browser family and major version.
- Platform category: Windows, macOS, Linux, ChromeOS, or unknown.
- Viewport width bucket: below 1024, 1024–1439, or at least 1440 CSS pixels.
- DPR bucket: 1 or below, above 1 through 2, or above 2.
- WebGPU initialization outcome.

Unknown/spoofed values must be tolerated. Store no raw user-agent strings,
exact GPU identifiers, canvas/audio fingerprints, or IP addresses in these
feature records. Benchmark hardware details belong in developer test reports,
not recipient telemetry.

Disclose activity collection before viewing. Distinguish server-observed
authorization from client-reported rendering, visibility, fullscreen, and
print events; do not infer attention or misconduct. Pause visible-time
accumulation while hidden, covered, or failed; network gaps must not create
unbounded accumulated time.

Revocation/expiry retains historical investigation records. Document deletion
removes the new fingerprint, session, and associated event records, alongside
the existing ciphertext/key deletion flow. Existing legacy audit records are
not silently repurposed as forensic evidence.

Show this warning before deletion:

> Deleting this document also removes its fingerprint records and activity
> history. Future screenshots cannot be investigated using those records.

Use accurate privacy copy: document contents and scan images are processed
locally; the server stores authorization, fingerprint associations, and
disclosed activity metadata. Inspect analytics and error-reporting traffic as
well as application endpoints. Do not upload plaintext, screenshots,
thumbnails, or analysis pixel buffers.

## 4. Ticket 1 experiment and release gates

Use at least **10 held-out PDF documents**, three recipient patterns per
document, and candidate sets of **1, 3, and 100**. Separate tuning and
evaluation documents. Freeze thresholds before held-out evaluation. Any
subsequent retuning must be disclosed and evaluated with fresh held-out data.

Report correct matches, misses, and wrong matches separately for every
required case and candidate-set size:

| Case | Required recovery |
| --- | ---: |
| Native full-page screenshot | 100% |
| Full page resized to 75% | ≥95% |
| Full page resized to 50% | ≥95% |
| Full page recompressed as JPEG quality 85 | ≥95% |
| Full page resized to 50%, then JPEG quality 85 | ≥95% |
| Native manually aligned crop retaining ≥50% of the page | ≥95% |

Zero wrong attributions are allowed in every case. Abstentions count as
misses. Do not pool transformation results to satisfy a threshold.

Use a pinned Chromium build's canvas JPEG encoder at quality `0.85`, record
its build/platform, and verify JPEG output. Record the resize method and
dimensions. Generate transformations from actual final-canvas screenshots,
not an ideal reference buffer.

Additional requirements:

- At least **200 complete negative scans**, covering unmarked pages, unrelated
  documents, blank/low-information inputs, unusable captures, and genuinely
  marked screenshots with the correct code withheld.
- Exercise single-candidate rules and the complete candidate/alignment search.
  Report results by candidate count; do not count individual wrong-code
  comparisons as independent complete negative scans.
- Describe results as "No wrong attributions observed in these N negative
  tests"; make no zero-risk production claim.
- Test crop correspondence at multiple locations. Treat transformed crops as
  experimental and report them separately.
- Use two human reviewers for paired marked/control readability checks across
  dense text, small numerical tables, sparse white pages, and image-heavy
  pages. Reject strengths causing additional transcription errors or
  distracting texture. Missing review remains unverified.
- Conduct a blind demonstration: another person chooses the recipient
  screenshot; matching receives pixels and authorized candidate patterns,
  without filename, fixture-label, or session hints. Repeat with unmarked and
  withheld-candidate inputs. For ticket 1, recipients are fixture patterns;
  ticket 2 repeats the demonstration with real authorized accounts.
- Verify determinism, clipping, CPU/GPU parity, and cleanup. Record first-page
  latency, page-change latency, 100-candidate scan time, and memory behavior
  with measurement methods and machine/browser details. Page-change latency
  becomes applicable when page navigation is introduced in ticket 3.

Later renderer tickets must repeat relevant qualification with independent
fixtures. Render only bounded page surfaces and process candidate residuals
incrementally; never allocate 100 full document copies. Keep cancellation and
explicit resource disposal in both rendering and scanning paths.

Run applicable unit, integration, lint, build, browser, and migration checks
for each ticket. Integration qualification also covers unauthorized users,
concurrent issuance, legacy permissions, revocation/expiry, resume/network
loss, forged/replayed events, deletion, fullscreen exit, and unavailable/lost
GPU devices. Preserve existing crypto and sharing checks.

Record actual browser/hardware coverage. Mocked WebGPU tests or software-only
tests do not prove hardware rendering. If required GPU checks or human reviews
are unavailable, report those gates as NOT RUN; do not declare the profile
passing or unblock dependent implementation. Missing physical captures leave
camera robustness unvalidated but do not block screenshot integration or
ticket 7; ticket 8 is optional.

## 5. Tickets and execution workflow

Keep the approved eight-ticket structure. These numbers are design ordinals,
not existing GitHub issue numbers.

| # | Delivery | Blocked by |
| --- | --- | --- |
| 1 | Prove the local PDF screenshot/crop round trip, readability, and frozen passing profile. | None |
| 2 | Integrate real recipient sharing and owner investigation, including authorization, read-only behavior, retention/deletion, and a blind three-account demonstration. | 1 |
| 3 | Protect and investigate every PDF page, with renderer-specific qualification. | 2 |
| 4 | Protect and investigate PNG/JPEG images, with orientation and recovery qualification. | 2 |
| 5 | Protect and investigate text/CSV using bundled fonts and deterministic pagination. | 2 |
| 6 | Show disclosed, bounded viewing activity in owner History. | 2 |
| 7 | Qualify supported formats, browser lifecycle, privacy, performance, and the complete screenshot demonstration. | 3, 4, 5, 6 |
| 8 | Measure real phone-photo recovery. Optional; does not block 7. | 2 |

Implement ticket 2 through smaller tested commits: records/interfaces,
recipient rendering, owner investigation, lifecycle/deletion, and final
demonstration. Preserve the rounded Neobrutalist design and existing theme
tokens throughout integration.

During execution:

1. Create `feat/read-only-webgpu-fingerprinting` from the clean baseline.
2. Apply the reviewed repository setup for GitHub Issues and single-context
   domain documentation.
3. Use explicit triage labels: `needs-triage`, `needs-info`, `ready-for-agent`,
   `ready-for-human`, and `wontfix`.
4. Write and self-review this amended design spec, update repository memory
   before committing, and obtain the written-spec review required by
   brainstorming. Conversational approval does not replace that review.
5. Invoke writing-plans and retain a separate implementation-plan review
   before ticket 1 coding.
6. Publish approved tickets with native blocking dependencies, using textual
   references if unavailable. Mark physical-camera work `ready-for-human`.
   The configured tracker is GitHub Issues in ANAMASGARD/EchoLeaks.
7. Execute ticket 1 first. Do not weaken failed gates or start dependent
   implementation without a passing, recorded profile.

Use disposable database validation and non-confidential fixtures. No
shared-database migration, push, deployment, or real email sending is included.
Use the existing package manager/lockfile; avoid unrelated dependency upgrades.
Update `memory/memory.md` briefly before every commit.

## References

- [WebGPU adapter API](https://developer.mozilla.org/en-US/docs/Web/API/GPU/requestAdapter)
- [Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)
- [Fullscreen API guide](https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API/Guide)
- [Spread-spectrum research](https://www.microsoft.com/en-us/research/publication/an-improved-spread-spectrum-technique-for-robust-watermarking/)

These references motivate implementation and test conditions; they do not
establish the reliability of this proposed fingerprint profile.
