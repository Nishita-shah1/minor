# Experimental recipient integration

On 2026-09-25 the user explicitly approved integrating before failed crop gates pass, retaining visible limitations. The user separately authorized applying `0002_cultured_karnak.sql` to the configured Neon database and enabling `EXPERIMENTAL_FINGERPRINTING=true` locally. This supersedes the previous integration block for this experimental path; it does not qualify the profile or authorize deployment.

## Local workflow

1. Upload a new PDF or static PNG/JPEG and create recipient links. Old unmarked recipient copies require reupload/reshare after activation.
2. Recipient decrypts the file locally, then clicks **Open protected view**. **Previous page / Next page** renders and marks the selected PDF page locally. The same document/copy identifier is reused across pages and visits.
3. Capture the document area, excluding browser controls and surrounding UI.
4. Owner opens Scan, adds the image, selects **Find the recipient copy**, chooses the owned document, unlocks owner keys, and loads historical copies. Analyze to resolve an exact recovered ID locally.
5. For manual reconstruction, expand **Advanced: original & alignment**, select the original and appropriate PDF page, and identify corresponding points. Crop recovery remains unreliable.

Large screenshot images are resized locally to the existing bounded inference surface, with original/result dimensions disclosed. The two primary panels remain upload and result; alignment and test-copy tools are collapsed.

## Data and implementation

`copy_fingerprints` stores a random AES-256 key separately RSA-wrapped to owner and recipient, with immutable document/share/profile references. Its raw key bytes act as the 32-byte fingerprint secret; the existing domain-separated derivation yields the 40-bit identifier locally. The server stores no raw fingerprint identifier or secret. Issuance inserts fingerprints atomically with shares and document envelopes. Existing copy records are not overwritten on retries. Owner collision checks include historical records; ambiguous recovered IDs still abstain. Concurrent owners issuing separately cannot have collisions proven absent by the server because identifiers are encrypted.

Owner candidates are authenticated, owner-scoped, no-store, and include historical revoked/expired share identities. Recipient access reuses the canonical share policy and releases only that copy's wrapper. Missing records after activation fail closed. Soft deletion explicitly erases fingerprint records. No background analytics/session subsystem was added.

The marked viewer shows completed output only, requires fullscreen, covers on visibility/fullscreen/restoration changes, refreshes authorization around every 15 seconds, and covers after 30 seconds without confirmation. GPU failure blocks display. New marked copies have no download action and omit document pixels during printing. Unsupported renderers fail closed. Authorized browsers still possess plaintext before marking.

## Verification and limits

- PASS: focused RSA wrapper/identifier test, including wrong-private-key rejection and distinct copy IDs.
- PASS: disposable PostgreSQL migrations, atomic append/deduplication/100-recipient concurrency checks, and 100 fingerprint records.
- PASS: real Chrome/WebGPU two-page PDF encode/decode; both pages recovered `[1,2,3,4,5]`; fullscreen exit removed the visible canvas.
- PASS: 3072×1920 evidence became 2590×1619 with explicit resize notice.
- PASS: TypeScript and focused lint (after ref cleanup warning correction).
- PASS: approved Neon migration applied; table presence and local flag verified.
- NOT RUN: authenticated owner/recipient end-to-end rehearsal, complete lifecycle/privacy suite, every renderer qualification, human readability, blind recovery, camera qualification, full build/E2E reruns (user requested focused checks only).

Screenshot tuning still has 87/270 crop misses. No production profile was frozen. This is a source-copy clue, not proof of who intentionally disclosed the content. Phone-photo success is not promised. Text/CSV/XLSX protected renderers are still not implemented.

## Missing WebGPU and existing copies (follow-up)

A real user browser returned no WebGPU adapter. The engine now chooses local ONNX WASM/CPU when WebGPU or shader-f16/device creation is unavailable. This remains experimental; it uses the same checksum-verified model and preprocessing, and does not upload pixels. The isolated browser check forcibly removed `navigator.gpu` from the worker and recovered the same identifier from both marked PDF pages. This is a focused compatibility check, not broad fallback qualification.

All unmarked recipient rendering paths are removed. A disabled server feature returns an explicit error, and missing copy records ask the owner to enable protection. History's **Prepare fingerprints for existing links** wraps fresh copy secrets using the owner's unlocked keys and verified recipient keys; **Save recipients / protection and show links** atomically inserts missing associations. Existing associations and URLs are never replaced. No server-generated plaintext identifiers or unauthenticated backfill is used. Screenshots captured before marking remain untraceable.

Full-screen evidence can be loaded and the page selected using two opposite corners through **Select document area**. This is a manual extraction step, not a claim of reliable automatic decoding with arbitrary browser chrome/background.

The separate Clerk session-touch network failure is not a watermark decoder failure. No authentication checks were bypassed or Clerk network failures suppressed. Protected viewing covers on offline/online transitions and requires fresh authorization.

During the edit, JSX was accidentally placed in `lib/shares/persist.ts`; the user reported the resulting parse error. The helper was restored, its intended SQL-only change reapplied, and TypeScript plus disposable PostgreSQL checks passed. The running share route subsequently returned 200 and the unauthenticated shares API returned 401.

The updated isolated Scan harness passed 10 checks, including exact-image decoding after selecting a page within a larger screenshot. Its authenticated lookup panel is stubbed; recipient lookup and Clerk connectivity are not covered by that harness. Initial selection automation failed because the standalone test page lacked overlay positioning CSS; matching that layout fixed the harness. No full suite or build was rerun.
