# EchoLeaks: Browser-Local TrustMark Fingerprinting

## Standalone Design and Delivery Plan

**Date:** 2026-09-25

**Status:** The user subsequently explicitly authorized starting code changes. Ticket 1 implementation is underway; experimental recovery gates still block dependent integration.

**Supersession:** This document replaces the earlier classical brightness-pattern design at this canonical path. Its public seeds, residual candidate-ranking detector, classical strength levels, no-ML constraint, optional camera work, and deferred XLSX scope are no longer active requirements. There is one active fingerprint specification.

**Evidence status:** An isolated, unqualified TrustMark worker and development lab exist. Initial WebGPU tuning smoke scans failed recovery. See `docs/fingerprinting/ticket-1-progress.md`; no passing profile or physical-camera qualification exists.

**Objective:** Build encrypted, read-only document sharing that lets an owner investigate which recipient’s displayed copy is consistent with a supplied screenshot or supported phone photograph.

**Delivery order:** Prove screenshot recovery first, integrate sharing and investigation, qualify every supported renderer, then qualify physical phone photographs.

**Meaning of success:** “100% screenshot recovery” means every case in the declared held-out evaluation passed. It is not a guarantee for arbitrary future captures.

---

## 1. Product Scope and Decisions

### 1.1 Required behavior

The recipient’s browser must:

1. Download the encrypted document.
2. Decrypt it locally using the existing key architecture.
3. Render the selected page into private pixel buffers.
4. Apply the recipient-copy fingerprint locally.
5. Display only the completed marked image.

The owner’s browser must:

1. Select an owned document and its original page.
2. Load a suspected screenshot or photograph locally.
3. Align the evidence when necessary.
4. Decode its fingerprint locally.
5. Compare the recovered identifier with authorized historical copy identifiers.
6. Show a matching distributed copy or an explicit non-match/inconclusive result.

Document contents, screenshot pixels, fingerprint secrets, and decoded identifiers must not be uploaded for analysis.

### 1.2 Supported formats

| Format | Required behavior |
|---|---|
| PDF | Every page, page navigation, Fit page, zoom |
| PNG/JPEG | Static images, explicit orientation normalization |
| Text | UTF-8 text rendered with bundled fonts and deterministic pagination |
| CSV | Quoted fields, embedded newlines, deterministic table pagination; values treated as data |
| XLSX | Readable paginated sheet tables using stored values and cached formula results |

XLSX does **not** promise Excel layout fidelity, chart rendering, macro execution, or formula recalculation. Missing cached formula results must be identified instead of silently invented.

DOC/DOCX, PPT/PPTX, legacy XLS, animated images, and unrestricted arbitrary file formats are outside this release.

The fingerprint engine accepts pixels independently of document format. Each format still needs its own qualified renderer.

### 1.3 Screenshot requirements

All supported screenshot cases must achieve **100% correct recovery, zero misses, and zero wrong attributions** in held-out qualification:

- Native full-page screenshots.
- Full pages resized to 75%.
- Full pages resized to 50%.
- Full pages recompressed as JPEG quality 85.
- Full pages resized to 50%, then recompressed as JPEG quality 85.
- Native manually aligned crops retaining at least 50% of the original page area.

Resized/recompressed crops remain experimental.

### 1.4 Phone-photo requirements

Physical-camera work starts after the complete screenshot milestone passes.

Required initial conditions:

- Full page visible, including all four corners.
- Sharp focus and no obscuring glare.
- Front-on or modest viewing angle.
- Original camera image.
- Manual perspective correction permitted.

Required recovery is **at least 95% for each declared device/capture condition**, with zero wrong attributions. Abstentions count as misses.

If a valid identifier cannot be recovered, return **Inconclusive**. Do not provide a guessed recipient, “most likely leaker,” or uncalibrated probability.

Phone-photo qualification is required before declaring the overall requested feature complete.

### 1.5 Existing shares

Protect **new uploads only**.

Existing recipient links must block unmarked viewing and explain that the owner needs to upload and share again. Preserve owner access for management and deletion.

There is no legacy fingerprint backfill in this release.

### 1.6 Product claims and limitations

Use **“low-visibility fingerprint.”**

Successful results must explain:

> This suggests a source copy, not who intentionally disclosed it.

The feature:

- Does not discover leaked material online.
- Does not establish who operated a camera or intentionally disclosed information.
- Does not prevent screenshots.
- Cannot prevent a determined authorized browser from accessing plaintext before marking.
- Does not make a publicly decodable watermark an unforgeable signature.
- Must not combine viewing activity with fingerprint evidence into a misconduct score.

---

## 2. Architecture and Implementation Contracts

### 2.1 Current repository baseline

The work branch is `feat/read-only-webgpu-fingerprinting`. Its pre-replacement documentation baseline is commit `17d082c`, based on application baseline `b852ec4`.

Existing foundations include:

- Next.js 16.3.3 and React 19.
- Clerk authentication and verified-recipient checks.
- Browser-local AES-GCM encryption/decryption and RSA-OAEP key wrapping.
- Private R2 ciphertext storage.
- Neon/PostgreSQL with Drizzle.
- PDF.js and crypto workers.

The current viewer exposes clean image Blob URLs, renders only the first PDF page, and permits downloads for download-enabled shares. Scan is a placeholder. TrustMark, fingerprint records, and viewing sessions are not implemented.

This document explicitly replaces the previously committed classical-pattern specification; its engine and detector requirements must not remain active alongside this design.

### 2.2 Runtime choice

Use:

- **TypeScript** for product orchestration.
- **ONNX Runtime Web with WebGPU** for local TrustMark inference.
- A dedicated browser worker for fingerprint processing.
- Existing Next.js APIs for authorization and encrypted metadata.
- Existing R2 and Neon integrations.

Rust and Python are reference/testing tools, not deployed inference services.

Adobe’s JavaScript implementation currently provides decoding; browser encoding requires a port and qualification. [TrustMark JavaScript documentation](https://github.com/adobe/trustmark/blob/2ecb73ad28d1a3f66ac9dc19e1b667711f14314f/js/README.md)

There is no automatic WASM fallback in the initial supported path. A fallback would need its own model, compatibility, performance, and recovery qualification.

### 2.3 Module boundaries

Keep five cohesive units:

| Unit | Responsibility |
|---|---|
| Document renderer | Convert one selected page/sheet into canonical private pixels |
| Fingerprint engine | Initialize models, encode/decode pixels, report runtime, release resources |
| Protected-view controller | Coordinate authorization, fullscreen, rendering, covers, cancellation |
| Investigation controller | Load evidence, align it, decode, resolve authorized candidates |
| Server services | Issue encrypted associations, authorize access, record bounded activity, delete records |

Only the fingerprint engine imports ONNX APIs.

Its contract must provide initialization for encoding or decoding, pixel encoding, structured decoding results, runtime information, cancellation, and asynchronous disposal.

React components must not contain model preprocessing, cryptographic derivation, database policy, and lifecycle logic in one component.

### 2.4 Initial TrustMark profile

Start with:

- TrustMark **Q**.
- **BCH_SUPER**, carrying a 40-bit identifier.
- Strength **1.0** as the initial experimental setting.
- Upstream commit `2ecb73ad28d1a3f66ac9dc19e1b667711f14314f`.

Q/BCH_SUPER is a candidate profile, not an already qualified production choice. Adobe documents strength as a visibility/robustness trade-off and BCH_SUPER as 40 payload bits with error correction. [TrustMark configuration](https://github.com/adobe/trustmark/blob/2ecb73ad28d1a3f66ac9dc19e1b667711f14314f/python/CONFIG.md)

On tuning fixtures, evaluate strengths `0.8`, `1.0`, `1.25`, and `1.5`. Select the lowest setting that passes preliminary recovery and human readability checks. Freeze it before held-out evaluation.

If no setting passes, stop dependent implementation.

### 2.5 Compatibility gate

Before database or product integration:

1. Establish BCH_SUPER golden vectors.
2. Prove browser encoding → reference decoding.
3. Prove reference encoding → browser decoding.
4. Prove browser encoding → browser decoding.
5. Repeat using actual screenshots of the final visible canvas.

Pin and record:

- Model hashes and upstream source revision.
- Tensor names, dimensions, and data types.
- Pixel normalization and resizing.
- Aspect-ratio handling.
- Residual scaling, clipping, and quantization.
- BCH packet layout, schema handling, and bit order.

The upstream Rust, Python, and JavaScript pipelines differ. Static review also identified different padding behavior for byte-aligned 40-bit payloads. This is a compatibility risk, not a confirmed runtime failure. Resolve it through vectors and cross-decoding before choosing the production implementation. [Rust data layer](https://github.com/adobe/trustmark/blob/2ecb73ad28d1a3f66ac9dc19e1b667711f14314f/rust/src/bits.rs), [Python data layer](https://github.com/adobe/trustmark/blob/2ecb73ad28d1a3f66ac9dc19e1b667711f14314f/python/trustmark/datalayer.py)

Use the documented Python packet construction as the initial ECC reference. Report numerical CPU/GPU differences separately from exact payload interoperability; do not assume different upstream image pipelines produce identical pixels.

### 2.6 Immutable profiles and model delivery

Each issued fingerprint references an immutable profile containing:

- Engine and preprocessing versions.
- Encoder/decoder hashes.
- ECC and identifier derivation versions.
- Strength.
- Renderer implementation and supporting assets.
- Canonical page geometry and aspect-ratio policy.
- Fonts, pagination, orientation, color, and quantization rules.
- Evidence reconstruction and decoding procedure.
- Qualification report reference.

Never substitute newer assets for an issued profile. Missing assets produce an explicit unavailable-profile error.

Host pinned models, runtime files, workers, and renderer assets as versioned static assets in the Next.js deployment. Load the encoder only for viewing and the decoder only for investigation.

Build preparation must verify model checksums and retain previously issued profiles. Cache public model assets; do not persist decrypted documents or investigation images.

Use a dedicated worker. ONNX’s `wasm.proxy` mechanism is incompatible with WebGPU. Match ONNX JavaScript and runtime asset versions. [ONNX environment options](https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html), [deployment documentation](https://onnxruntime.ai/docs/tutorials/web/deploy.html)

### 2.7 Rendering and memory

Preserve the existing encryption format: download and decrypt the complete file, then render pages progressively. This release does not introduce chunked authenticated encryption.

For every renderer:

- Render clean content privately.
- Apply the mark from clean source pixels each time.
- Never accumulate marks over previously marked output.
- Present only the finished marked surface.
- Pin fonts and supporting assets.
- Define canonical dimensions and aspect-ratio handling in the profile.
- Qualify unusually tall or wide content explicitly; do not silently rely on center-only marking.

Retain at most the current and next marked page, one private working surface, and one active inference operation.

Cancel obsolete work on navigation, closure, authorization loss, or GPU failure. Release canvases, image objects, PDF resources, tensors, sessions, and workers.

### 2.8 Fingerprint identity and cryptography

For each immutable document/share association:

1. Generate a random 32-byte fingerprint secret locally.
2. Wrap it to the recipient’s public key.
3. Wrap it separately to the owner’s public key.
4. Derive a five-byte identifier locally using domain-separated SHA-256.
5. Encode that identifier through BCH_SUPER.

Use a precisely specified binary derivation:

```text
SHA-256(
  UTF8("EchoLeaks/TrustMark/copy-id/v1")
  || 0x00
  || document UUID as 16 bytes
  || fingerprint secret as 32 bytes
)[first 5 bytes]
```

Publish deterministic derivation vectors.

The same association reuses its identifier across pages, zoom changes, sessions, and repeat visits. A replacement document or different share association gets a new secret.

The server stores neither raw secrets nor raw identifiers. Do not add a public identifier hash as a substitute.

### 2.9 Collision handling and atomic issuance

A 40-bit identifier is not globally collision-proof.

Preserve the existing one-share-batch-per-upload-group model. Before submission, the owner checks every derived identifier in the complete batch for collisions within each document’s decoding namespace. Regenerate a colliding secret; abort after 16 unsuccessful attempts.

Persist the complete batch atomically:

- Shares.
- Document key envelopes.
- Fingerprint wrappers.
- Immutable issued recipient identity.
- Key versions and profile references.

Retain the existing limits of 100 recipients and 10 documents per group.

Use an issuance UUID and a digest of the canonical encrypted request:

- Same issuance UUID and identical request returns the existing result.
- Same UUID with different content returns a conflict.
- A competing batch for the same group returns a conflict.
- Unknown network outcomes are resolved by retrieving the owner’s existing batch.
- Retries do not regenerate secrets or replace persisted fingerprints.

The installed Neon HTTP driver requires supported atomic SQL/batch operations; do not design around unsupported interactive transaction callbacks.

Server validation can enforce ownership and structure, but cannot prove correct secret derivation inside encrypted wrappers.

### 2.10 Records and API changes

Add:

- Immutable upload protection version.
- Recipient fingerprint associations, unique by document/share.
- Viewing sessions.
- Bounded session events.
- Persisted throttle and issuance-idempotency state.

Fingerprint records preserve owner/recipient wrappers, issued recipient identity, key versions, profile ID, and creation time.

Required API capabilities:

| Interface | Behavior |
|---|---|
| Share preparation/issuance | Accept complete encrypted fingerprint envelopes; enforce qualified profiles and view-only permission |
| Recipient session creation | Reuse full access policy; return only that recipient’s wrapper, profile, and authorized ciphertext access |
| Session revalidation | Recheck identity, email, document/share status, schedule, and session validity |
| Session events | Accept bounded allowlisted events with sequence deduplication |
| Owner original access | Return owned ciphertext access and existing owner key material |
| Owner candidates | Return all historical owner wrappers and immutable identities for the selected document |
| Owner activity | Return disclosed session summaries with provenance |

All private responses use `no-store`.

Candidate retrieval includes revoked and expired copies. Never silently truncate candidates or resolve an old fingerprint through a reassigned identity.

### 2.11 New-upload cutover

Introduce a server-set group protection version:

- Existing groups become version `0`.
- Both current upload creation paths create version `1` groups once the feature is enabled.
- Uploads started before cutover remain legacy.
- Legacy recipient access returns `LEGACY_REUPLOAD_REQUIRED`.
- Version `1` uploads missing required fingerprint material fail closed as incomplete/corrupt.

Missing wrappers alone must not determine whether a document is legacy.

Keep owner listing and deletion available. Recipients awaiting enrollment remain waiting; no new enrollment-completion subsystem is included.

### 2.12 Protected viewer

Use three display states:

```text
COVERED / PREPARING
MARKED
BLOCKED / ERROR
```

There is no visible clean state.

Before expensive decryption/rendering, check secure context, adapter/device creation, required model capabilities, and successful model initialization.

Request fullscreen only from an explicit user action. Preserve page and zoom when covering or re-entering.

Cover:

- When the page becomes hidden.
- On fullscreen exit.
- On suspension/restoration.
- Immediately after authorization rejection.
- After 30 seconds without successful authorization confirmation.
- On GPU loss, failed inference, or an unavailable profile.

Revalidate approximately every 15 seconds while visible. After restoration, keep the cover until fresh authorization succeeds.

Use operation-generation guards so late decryption or rendering cannot uncover content after revocation or cancellation.

Enforce `VIEW_ONLY`; reject new download permission requests while retaining database enum compatibility. Remove recipient download/export actions and replace protected content during printing.

### 2.13 Investigation and partial crops

Workflow:

```text
Select document → Select original page → Add evidence → Align → Analyze
```

Require owner keys and the issued profile. Distinguish decryption failure, unavailable renderer/model, invalid alignment, unsupported coverage, and failed identifier recovery.

Freeze a bounded procedure:

1. Normalize image orientation.
2. Attempt direct decoding once.
3. Permit one manually aligned reconstruction and one further decode.
4. Do not automatically sweep crops, angles, variants, strengths, or schemas.

An explicit alignment change starts another user-visible attempt. Qualification must account for the entire procedure, including retries.

For full pages, manually map the page corners.

For partial screenshots:

1. Select four corresponding points in the screenshot and original.
2. Map observed pixels into canonical page coordinates.
3. Fill unobserved areas with the clean original.
4. Decode the reconstructed page.
5. Compute coverage using observed pixels only.

Require at least 50% observed page coverage. Filled pixels are not evidence.

This reconstruction method is experimental. If it cannot pass the crop gate, integration remains blocked.

Result states:

| Result | Meaning |
|---|---|
| `CANDIDATE_MATCH` | Valid identifier maps to exactly one authorized historical copy |
| `UNKNOWN_MARK` | Valid compatible identifier maps to no authorized copy |
| `NO_RELIABLE_MARK` | Supported screenshot processing recovered no valid identifier |
| `INCONCLUSIVE` | Unsupported evidence, prerequisite failure, ambiguity, conflicting results, or unsuccessful phone-photo recovery |

A single candidate still requires a valid decoded identifier. Never choose the nearest candidate or invent a runner-up margin.

Show the original and evidence for visual comparison. A matching identifier is not proof of content authenticity or authorship.

### 2.14 Activity, privacy, and deletion

Keep activity separate from fingerprint evidence. Disclose collection before viewing. Distinguish server-observed authorization from client-reported rendering, visibility, fullscreen, and print events.

Permitted context:

- Browser family and major version.
- Platform category: Windows, macOS, Linux, ChromeOS, or unknown.
- Viewport bucket: below 1024, 1024–1439, or at least 1440 CSS pixels.
- DPR bucket: ≤1, >1 through 2, or >2.
- WebGPU initialization outcome.

Tolerate unknown or spoofed values. Do not store raw user agents, exact GPU identifiers, IP addresses, or device fingerprints in these records. Benchmark hardware details belong in developer qualification reports, not recipient telemetry.

Default session controls:

- One session per explicit opening; separate tabs use separate sessions.
- Four-hour maximum lifetime and two-minute inactivity expiry.
- Event body limit: 16 KiB.
- Maximum 20 events per submission.
- Unique session/sequence deduplication.
- Persisted throttling: 10 session creations/account/minute; 30 revalidation/event requests/session/minute and 120/account/minute.
- Expired sessions require a new authorized opening.

Estimate visible time only from consecutive accepted observations reporting marked, visible, fullscreen, authorized content. Credit at most 15 seconds per interval; gaps over 30 seconds credit zero. Client timestamps and replayed events cannot add time.

Call the metric **“estimated visible time.”**

Revocation and expiry retain historical fingerprints. Document deletion must explicitly erase fingerprints, sessions, and associated events because the existing deletion flow uses soft deletion.

Block new access at `DELETING`; coordinate issuance and deletion atomically; make cleanup retryable.

Show:

> Deleting this document also removes its fingerprint records and activity history. Future screenshots cannot be investigated using those records.

Inspect application, analytics, and error-reporting requests for plaintext, evidence, identifiers, and secrets.

Use accurate privacy copy: document contents and scan images are processed locally; the server stores authorization, encrypted fingerprint associations, and disclosed activity metadata.

---

## 3. Qualification and Release Gates

### 3.1 Experimental discipline

Separate tuning and evaluation data.

Before held-out evaluation, freeze:

- Model/profile and strength.
- Renderer settings.
- Preprocessing and reconstruction.
- Candidate resolution.
- Complete retry procedure.
- Supported browser/device configurations.

If evaluation fails and the implementation is adjusted, use fresh held-out data. Do not silently reclassify failures or tune against expected recipient identities.

Missing hardware, human review, or physical captures is **NOT RUN**, not a pass.

### 3.2 Screenshot corpus and matrix

Ticket 1 uses at least:

- 10 held-out PDF documents.
- Three independently generated recipient identifiers per document.
- Candidate sets of 1, 3, and 100.
- Dense text, numerical tables, sparse pages, and image-heavy content.

| Required case | Correct recovery | Wrong attribution |
|---|---:|---:|
| Native full page | 100% | 0 |
| Resize to 75% | 100% | 0 |
| Resize to 50% | 100% | 0 |
| JPEG quality 85 | 100% | 0 |
| Resize to 50%, then JPEG 85 | 100% | 0 |
| Native aligned crop retaining ≥50% | 100% | 0 |

Report counts separately for every case and candidate count. Reusing one image against three candidate sets does not create three independent captures.

Abstentions count as misses. Do not pool transformation results to satisfy a gate.

Generate transformations from screenshots of the actual final visible canvas. Pin the Chromium build, canvas JPEG encoder at `0.85`, resize method, output dimensions, and platform. Verify that JPEG output is actually JPEG.

Crop evaluation covers 50%, 65%, and 80% retained area at center, top, bottom, left, and right positions. Required crop cells must each pass.

Qualify the supported display-size and DPR configurations explicitly. Do not infer browser-wide support from one machine.

### 3.3 Negative scans

Use at least 200 distinct negative inputs covering:

- Unmarked pages.
- Unrelated documents and valid foreign identifiers.
- Blank or low-information images.
- Unusable or unsupported captures.
- Marked captures with the correct identifier withheld.

Run the complete decoding/alignment procedure against candidate sets of 1, 3, and 100.

No negative scan may name a recipient.

Report:

> No wrong attributions observed in these N negative tests.

Do not claim a zero production false-attribution rate.

### 3.4 Readability and blind demonstrations

Two human reviewers must compare marked and unmarked output across the representative page categories.

Include reading/transcription tasks. Reject settings that cause additional errors or distracting texture.

For blind recovery:

- Another person selects the recipient capture.
- The investigator does not know the expected recipient.
- Matching receives pixels and authorized candidates only.
- Filenames, metadata, fixture labels, and sessions must not reveal the answer.
- Repeat with unmarked and withheld-candidate evidence.

Ticket 1 uses fixture identities. Ticket 2 repeats this with an owner and two enrolled recipient accounts.

### 3.5 Renderer qualification

Tickets 3–5 repeat the screenshot matrix with independent format-specific fixtures.

Include:

- PDFs with different page sizes and multipage navigation.
- PNG/JPEG orientation, transparency, and aspect-ratio cases.
- Text with pagination and punctuation.
- CSV with small numbers, quoted cells, and multiline values.
- XLSX with multiple sheets and cached/missing formula results.

A passing PDF result does not qualify another renderer.

### 3.6 Controlled physical-camera matrix

Start after ticket 7 passes.

Minimum matrix:

- Two phone models.
- Two displays: a laptop panel and an external monitor.
- Front-on and approximately 20° horizontal-angle captures.
- Approximately 50 cm capture distance.
- Diffuse indoor lighting, fixed documented display brightness.
- No obscuring glare, deliberate blur, camera filters, or digital zoom.

Use 30 independent photographs per phone/display/angle cell: ten held-out pages, three recipient identifiers each. Include all supported renderer families across those pages.

This produces **240 physical photographs across eight cells**.

Each cell requires at least **29 correct recoveries out of 30**, with zero wrong attributions. Report results by renderer as well.

Use separate camera tuning images. Alignment must not use knowledge of the expected recipient.

Add physical unmarked and withheld-candidate negatives. Camera negatives must never name a recipient.

Broader angles, dim lighting, substantial glare, partial-page photographs, and recompressed camera images remain experimental until separately qualified.

If the profile changes for camera robustness, repeat screenshot and readability qualification under the new immutable profile.

### 3.7 Runtime, security, and performance verification

Required checks include:

- ECC vectors, malformed packets, schema handling, and correctable-error cases.
- Cross-implementation encoding/decoding.
- Real WebGPU execution on target Chrome/Edge configurations.
- GPU loss and unsupported-device behavior.
- No clean-frame flashes during initialization, navigation, resize, or failure.
- Atomic and concurrent issuance, retries, and forced identifier collisions.
- Owner/recipient wrapper isolation and unauthorized access.
- Legacy entry-point blocking.
- Revocation, expiry, network loss, suspension, resume, and fullscreen exit.
- Event limits, replay protection, throttling, and visible-time bounds.
- Deletion/issuance races and retryable cleanup.
- Network inspection during viewing and scanning.
- Resource cleanup during repeated navigation and scanning.

Record cold/warm first-page latency, page-change latency, encoder time, decoder time, 100-candidate resolution time, and memory behavior. Include measurement methods, browser builds, and machine details.

Use non-confidential fixtures and disposable databases.

Applicable repository commands:

```bash
npm ci
npm run lint
npm run test
npm run db:check
npm run build
npm run test:e2e
```

Generate and review migrations during implementation. Apply them only to an explicitly disposable validation database.

---

## 4. Eight Tickets and Delivery Order

| # | Delivery and acceptance | Blocked by |
|---|---|---|
| **1** | Local TrustMark compatibility lab; real WebGPU PDF encode/decode; complete screenshot/crop matrix; negatives; readability; frozen passing profile | None |
| **2** | New-upload fingerprint issuance, protected first-page PDF viewing, owner Scan, authorization, legacy blocking, deletion, and blind three-account demonstration | 1 |
| **3** | Every PDF page, bounded navigation, cleanup, independent PDF qualification | 2 |
| **4** | PNG/JPEG rendering, orientation handling, independent image qualification | 2 |
| **5** | Text, CSV, and basic XLSX tables with bundled fonts and independent qualification | 2 |
| **6** | Disclosed sessions and bounded activity in owner History | 2 |
| **7** | Complete screenshot milestone: all formats, lifecycle, privacy, performance, negatives, and end-to-end demonstration | 3–6 |
| **8** | Controlled physical-camera qualification and final overall completion report | 7 |

Ticket 8 is mandatory for the overall goal, although ticket 7 is a separately reportable screenshot milestone.

### Ticket 1 steps

- [ ] Pin source, models, licenses, and artifact manifest.
- [ ] Establish ECC and identifier-derivation vectors.
- [ ] Resolve reference-pipeline differences.
- [ ] Implement the isolated browser engine and local lab.
- [ ] Prove bidirectional reference compatibility.
- [ ] Capture real marked-canvas screenshots.
- [ ] Qualify full pages, transformations, and crop reconstruction.
- [ ] Complete negatives, readability, and blind tests.
- [ ] Publish the measured result and freeze the passing profile—or record failure and stop.

### Ticket 2 commit sequence

Use small tested commits:

1. Protection-version cutover and encrypted fingerprint records.
2. Atomic issuance, idempotency, access interfaces, and disposable-database validation.
3. Protected viewer controller and first-page PDF rendering.
4. Owner investigation and exact candidate resolution.
5. Authorization lifecycle, legacy blocking, print behavior, and deletion.
6. Blind three-account demonstration and privacy evidence.

Session primitives needed by the viewer belong here; the owner-facing History experience belongs in ticket 6.

### Maintainability review

Before accepting each ticket:

- Keep ONNX isolated behind the engine.
- Keep access checks in the existing canonical policy layer.
- Avoid scattered feature-condition branches.
- Use explicit state and result types.
- Prefer removing duplicated logic over adding wrappers.
- Justify any file growing beyond 1,000 lines.
- Preserve the repository’s rounded Neobrutalist UI.
- Avoid unrelated refactors and dependency upgrades.

---

## 5. Review, Execution Boundaries, and Final Handoff

### 5.1 Required review sequence

Before coding:

1. Review this standalone design for scope, privacy, feasibility, and acceptance criteria.
2. Replace the outdated classical specification with the approved TrustMark design.
3. Self-review the written specification for contradictions and omissions.
4. Update repository memory and commit the documentation.
5. Obtain the required written-spec review.
6. Produce the detailed task-level implementation plan and review it separately.
7. Publish approved GitHub tickets with blocking dependencies.
8. Start ticket 1.

Use the existing branch; do not recreate it or reset unrelated work.

GitHub triage labels remain:

- `needs-triage`
- `needs-info`
- `ready-for-agent`
- `ready-for-human`
- `wontfix`

Mark physical captures and human readability review as `ready-for-human`. A readiness label does not override a failed dependency.

### 5.2 Vercel deployment design

The deployable product remains a Next.js application with browser-local inference. No Rust/Python inference server is required.

Keep existing Clerk, Neon, and R2 integrations. Vercel serves the application, APIs, and versioned public inference assets.

Install the Vercel CLI for later environment and deployment work:

```bash
npm i -g vercel
```

Actual deployment remains outside this execution authorization.

### 5.3 Explicit execution limits

The plan does not authorize:

- Pushing commits or opening a PR.
- Deploying or promoting a release.
- Shared/production database migrations.
- Real email sending during validation.
- Uploading private documents or evidence to inference services.
- Weakening failed recovery gates.
- Claiming missing manual tests passed.

Update repository memory before every commit and stage only intended files.

### 5.4 Final evidence package

The final handoff must include:

- Commits and implementation status by ticket.
- Immutable profile manifest and model hashes.
- Reference compatibility results.
- Screenshot recovery counts by transformation, renderer, and candidate count.
- Complete negative-scan results.
- Human readability records.
- Blind demonstration records.
- Physical-camera results by hardware and condition.
- Authorization, lifecycle, deletion, and privacy results.
- Performance measurements and resource-cleanup observations.
- Supported configurations and explicit limitations.
- Clear `PASS`, `FAIL`, and `NOT RUN` labels.

**Completion rule:** The overall feature is complete only when ticket 7’s screenshot gates and ticket 8’s physical-camera gates pass. A failed or unavailable gate remains visible in the report and blocks the corresponding completion claim.

---

## Written-spec preparation record

- The TrustMark replacement is written; conversational design approval is recorded.
- The old classical protocol is explicitly superseded at the same canonical path.
- The existing branch and issue/domain conventions are retained.
- Inline self-review checked placeholders, conflicting protocol requirements, screenshot/photo gate consistency, scope, and ticket dependencies. Unchecked ticket steps are future work, not completed tests.
- Written-spec review is pending; the detailed coding plan is not yet produced.
- No TrustMark code, dependency, migration, issue publication, or deployment is included in this documentation change.
- No recovery, GPU, human-readability, or physical-camera gate has been run or passed.
