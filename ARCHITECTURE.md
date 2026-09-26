# EchoLeaks architecture and current state

Updated 2026-09-26. This describes the code currently in this repository, including experimental behavior and known gaps. For work rules read `AGENTS.md`; for a quick status snapshot read `memory/memory.md`. Dated plans and experiment reports under `docs/` record decisions and evidence, but may describe an earlier implementation.

## Product boundary

EchoLeaks is encrypted, read-only sharing with local investigation of a suspected screenshot. Clerk establishes an account and verified email; it does not decrypt documents. A matching TrustMark identifier suggests which distributed copy was displayed. It does **not** establish who took a screenshot or intentionally disclosed content, authenticate the screenshot, prevent capture, or discover leaks online. The fingerprint profile is experimental; the product must not promise reliable recovery for arbitrary screenshots or photos.

```text
Owner browser: plaintext file -> AES-GCM ciphertext -> private R2
               file/copy keys -> RSA-wrapped envelopes -> Neon
Server:        Clerk authorization + status/schedule checks + encrypted metadata
Recipient:     R2 ciphertext -> local decrypt -> private pixels -> local mark -> covered viewer
Owner Scan:    screenshot pixels -> local decode -> local ID comparison with unwrapped owner records
```

The authorized recipient's browser necessarily sees plaintext before marking. The server stores normal authorization/share metadata and encrypted material; invitation URLs pass transiently through EchoLeaks's email endpoint and Brevo. No document plaintext, screenshot pixels, raw fingerprint secret, or decoded identifier is stored for analysis by the server.

## Runtime and entry points

| Area | Current implementation |
| --- | --- |
| Web | Next.js 16.3.3 App Router, React 19, Tailwind v4, Neobrutalist components and tokens in `app/globals.css` |
| Identity | Clerk in `proxy.ts`, dashboard layout/pages, and `lib/auth/current-verified-user.ts`; private APIs enforce verified-user checks |
| Database | Neon/PostgreSQL, Drizzle schema in `lib/db/schema.ts`, migrations in `drizzle/` (through `0007`), Neon HTTP driver |
| Object/email | Private Cloudflare R2 with short-lived signed object access; Brevo delivery through server routes |
| Browser crypto | Web Crypto AES-256-GCM and RSA-OAEP-3072/SHA-256, Argon2id/libsodium backup, IndexedDB and workers |
| Fingerprint | Adobe TrustMark Q/BCH_SUPER, pinned ONNX models, ONNX Runtime Web 1.30, WebGPU with local WASM fallback |

Routes: `/` is the public landing page (`components/landing/hero-section.tsx`, animated WebP visual with optional audio). `/dashboard` shows owner exposure-risk summaries from disclosed viewing sessions, `/dashboard/upload` encrypts and shares, `/dashboard/history` manages owned groups/links, `/dashboard/scan` investigates screenshots, `/dashboard/profile` manages the account and key vault, `/share/[shareId]` is the recipient entry point, and `/fingerprint-lab` is an experiment. Dashboard pages call `auth.protect`; `proxy.ts` initializes Clerk rather than being the sole authorization boundary. APIs under `app/api/` authorize their own requests and send private responses with `no-store`.

The app is installable through `app/manifest.ts`, the icons in `public/pwa/`, and `public/sw.js`. The landing install card uses the browser prompt where available and manual steps in supported browsers without an offered prompt. The service worker caches only the public offline page and icons; all navigation stays network-first and falls back to `public/offline.html` when disconnected. Account, share, API, and decrypted document data are never stored in its cache, so those workflows require connectivity.

## Dashboard workspace lifetime

`components/dashboard/persistent-workspaces.tsx` retains the five visited dashboard views in the authenticated shared layout. Scan images/results, Upload queues, sharing drafts, and DOM state survive sidebar and browser history navigation within the dashboard. Hidden workspaces remain mounted so initiated local scans/uploads can finish; portal dialogs are visibility-gated. Workspace state lives only in this tab's memory and is discarded on refresh, leaving the dashboard layout, sign-out, or account/session change. This does not add plaintext to IndexedDB, localStorage, the service worker, or a server cache.

History/share metadata and Scan recipient records refresh when their workspace is reactivated. Scan retains its result when the recipient snapshot is unchanged and requires another scan if the records changed. Upload requests/workers are aborted when the retained workspace unmounts. `npm run test:workspace-state` exercises the real workspace components with synthetic authentication, API records, and decoder results; it tests UI lifetime, not fingerprint reliability.

## Keys, encrypted files, and records

`hooks/use-key-vault.ts` and `components/crypto/key-vault-dialog.tsx` manage a user RSA keypair. The private key is available locally as a nonextractable IndexedDB key; an Argon2id-encrypted private-key backup and public key live in `user_key_bundles`. The server never uses the private key to decrypt files.

`components/dashboard/upload-workspace.tsx` stages up to 10 files (25 MiB each, 100 MiB per group). `workers/file-crypto.worker.ts` encrypts each file with its own AES-256-GCM key; only ciphertext is uploaded to R2. Document metadata is encrypted. The owner receives a wrapped document key. The present format downloads and decrypts a complete file before rendering; it is not chunked or streamed.

`lib/db/schema.ts` defines:

| Record | Purpose |
| --- | --- |
| `upload_groups`, `documents` | Ownership, encrypted object location, upload/deletion status |
| `document_key_envelopes` | Wrapped per-document key for owner or claimed recipient |
| `share_batches`, `shares` | One batch per group, appendable recipients, access window, status, normalized email, name snapshot, Clerk ID, email attempt state |
| `copy_fingerprints` | One encrypted copy secret per document/share, wrapped separately for owner and recipient, profile ID; no plaintext ID |
| `invitation_grants` | Pending encrypted temporary grant, verifier/proof, owner-wrapped invitation secret, owner copy wrappers |
| `access_events` | Simple access events (decrypt success/fail); not a full activity product |
| `viewing_sessions`, `session_events` | Disclosed recipient viewing sessions and bounded behavior events; owner dashboard aggregates **exposure risk %** (heuristic, not leak proof) |

`EXPERIMENTAL_FINGERPRINTING` in `lib/fingerprint/server-config.ts` gates fingerprint issuance and protected integration. `.env.example` sets it to `false`; local activation and migration `0004` were previously approved, but other environments must be checked individually. No database migration should be applied implicitly by documentation or a build.

## Sharing and invitation state

`components/dashboard/share-panel.tsx` is the owner UI. Recipient emails can be entered directly or imported from CSV/TXT/XLSX; that XLSX support imports **recipient addresses only**. A group has one share batch, and later recipients are appended while preserving existing share IDs and links. The UI can reopen links. The share limit is 100 recipients per group. `app/api/upload-groups/[groupId]/shares/prepare` looks up verified Clerk email and published key bundles; `lib/shares/persist.ts` handles persistence.

- **Enrolled recipient:** Owner browser wraps each document key and a new recipient-copy secret to that recipient's public key. New links are view-only. Brevo email can be sent or retried per share; `ACCEPTED` means provider acceptance, not inbox delivery.
- **OpenPGP recipient key:** Sending a link uses the public key saved on Profile. The browser encrypts the document keys to it and Neon stores only the ciphertext in `share_openpgp_envelopes`. The email still carries the share link. After the recipient signs in with the invited Clerk email, `/share/[shareId]` asks them to upload their private key. The file opens only when that private key's fingerprint matches the saved public key. EchoLeaks never receives the private key. `user_openpgp_keys` stores the published public key. Migrations `0005` and `0006` add these tables.
- **Recipient without a key:** Owner browser generates a 32-byte invitation secret and locally AES-GCM-encrypts a temporary grant containing the needed document/copy keys (`lib/shares/invitation-crypto.ts`). Neon holds only the encrypted grant, verifier, owner-encrypted invitation secret, and owner copy wrappers. The emailed URL carries the secret in its fragment. `components/share/invitation-capture.tsx` preserves it across Clerk redirects and removes it from the address bar.
- **Claim:** `app/api/shares/[shareId]/invitation` releases the encrypted grant only after the signed-in Clerk user has the **exact invited email among verified addresses**. The browser sets up/unlocks secure access, decrypts the grant locally, wraps keys to its public key, and posts to `app/api/shares/[shareId]/claim`. `lib/shares/claim-sql.ts` atomically binds the share to the Clerk user, installs all document and fingerprint envelopes, activates the share, and erases the temporary grant. The link or invitation secret alone is insufficient for access. Existing `AWAITING_RECIPIENT_KEY` shares can be prepared without changing share IDs.

The server checks claim structure and public-key fingerprint, but cannot independently prove the plaintext inside browser-created encrypted envelopes. The application does not store plaintext document keys or fingerprint secrets in Neon.

## Protected recipient viewer

`app/share/[shareId]/page.tsx`, `components/share/secure-share-client.tsx`, `components/share/secure-viewer.tsx`, and `components/share/share-account.tsx` handle the recipient path. The page shows the signed-in Clerk name/email/ID and `UserButton` outside the protected canvas. `lib/shares/policy.ts` is the common access decision: Clerk user ID, verified invited email, share/group status, opening/expiry. The access endpoints authorize before returning encrypted manifest, wrapped keys, and short-lived ciphertext URL. A pending invitation cannot read a document.

The browser decrypts, renders a selected page privately, applies the copy identifier with the TrustMark worker, and displays only completed marked pixels. Current protected renderers are **every PDF page** with previous/next and fit/zoom controls, and **static PNG/JPEG**. Unsupported file types and missing fingerprint data fail closed. Legacy unmarked copies are blocked in the experimental protected path; the owner can still manage old groups.

The viewer requests fullscreen from a user action and keeps content covered outside fullscreen, while hidden/restored, after authorization rejection, after 30 seconds without confirmation, or on inference failure. Visible access is rechecked about every 15 seconds. Browser print hides protected content. Recipients must accept an activity disclosure before protected viewing; the browser then opens a bounded viewing session and reports allowlisted events (heartbeat while marked/visible/fullscreen/authorized, visibility, fullscreen, page changes, print attempts). The server computes **estimated visible time** (≤15s credit per interval, gaps >30s credit 0) and the owner dashboard shows **exposure risk %** from those signals only — never merged with fingerprint Scan into a misconduct score. These are viewing restrictions and heuristics, not DRM or proof of a leak. `VIEW_AND_DOWNLOAD` remains in the database enum for compatibility; new protected links use `VIEW_ONLY` and have no application download/export control.

`lib/fingerprint/lab/render.ts` and `pdf-document.ts` render bounded private surfaces. PNG/JPEG source files are checked before bitmap decoding (25 MiB file, at most 24 MP and 12,000 px per side); the entire image is fitted to a marked surface of at most 4,194,304 pixels and 4,096 px per side, with a reduction notice. Arbitrary-resolution originals are not accepted. PDF pages are rendered at bounded size. Text, CSV, XLSX, DOCX, slides, animated images, and executable files are **not** protected renderers today.

## Fingerprint protocol and Scan

`lib/fingerprint/copy-secret.ts` creates a random 32-byte secret per document/share and wraps it separately for owner and recipient. `lib/fingerprint/identity.ts` derives a stable five-byte identifier from domain-separated SHA-256 of the document UUID and secret. It stays the same across pages and visits for that association, and changes with a new association. The owner checks IDs known in the batch for collisions (up to 16 retries). This client-side check is not a global collision guarantee under concurrent encrypted issuance.

`lib/fingerprint/trustmark/manifest.json` pins the experimental `trustmark-q-lab-v2` profile and model hashes. `scripts/prepare-fingerprint-assets.mjs` prepares versioned model/runtime/PDF.js assets in generated `public/fingerprint-assets/`; the directory is not tracked. `workers/fingerprint.worker.ts` isolates ONNX inference. The browser uses WebGPU when usable, otherwise local WASM/CPU. The worker reports `qualified: false`; no inference service is deployed.

`components/fingerprint/scan-workspace.tsx` uploads PNG/JPEG evidence to the **browser only**. `components/fingerprint/copy-lookup.tsx` automatically pages through owner-only `/api/fingerprints`, unwraps owner copy secrets locally, and derives candidate IDs. Unlocking the owner's vault may still be necessary. `lib/fingerprint/lab/investigate.ts` attempts direct decoding and, when supplied, one manually aligned reconstruction. Full-screen captures can select the document area; partial crops need corresponding points and at least 50% observed original-page coverage. A unique exact ID match displays the stored recipient name/email and share ID. Valid unknown IDs, missing marks, conflicting IDs, unsupported geometry, and unavailable prerequisites remain distinct results. Owner records are used for exact resolution, not to bias the decoder.

## Deletion, privacy, and known gaps

Revocation/expiry blocks access but preserves historical copy associations. `lib/server/delete-upload.ts` marks documents/groups `DELETING`, removes R2 objects, key envelopes and invitation grants, erases viewing sessions/events for those documents, then soft-deletes metadata. **Current gap:** it deletes `copy_fingerprints` only while `EXPERIMENTAL_FINGERPRINTING=true`; do not state that deletion always erases fingerprint history. Legacy `access_events` remain as minimal share audit records alongside the newer session activity tables.

Current qualification is incomplete. Strength-1 synthetic tuning recorded 18/18 in each full-page transformation case, 183/270 native crops, and no named recipient in 200 negatives; half-size plus JPEG85 still fails in a later smoke run. See `docs/fingerprinting/evidence/` for exact fixtures and methods. Human readability review, frozen held-out profile, format-specific recovery, blind authenticated multi-account sharing, full negative matrix, and physical phone-camera qualification are not complete. The user approved **experimental integration despite failed crop gates**, not a production success claim. Real Brevo delivery and a complete authenticated invitation → marked screenshot → Scan rehearsal remain unverified.

Clerk lookup/network interruptions can produce fail-closed, retryable 503 responses from shared-link access and key-vault routes; the underlying intermittent 10-second failure was not conclusively reproduced. Do not weaken identity checks to mask this. `/dashboard` aggregates exposure risk from disclosed viewing sessions; `/dashboard/history` still owns group/share management. No automatic online leak discovery or phone-photo attribution exists. Exposure risk is an uncalibrated heuristic — hand copies and phone photos of the screen remain possible without a recoverable TrustMark.

## Working on this codebase

Start with `AGENTS.md`, this file, `memory/memory.md`, and the relevant source. Read `node_modules/next/dist/docs/` before Next.js code changes as required by the generated agent rule. Review `docs/superpowers/specs/2026-09-25-webgpu-fingerprinting-design.md` and the fingerprint evidence when changing scope or claims; inspect implementation first because earlier plans may no longer reflect the experimental integration.

Common checks: `npm run lint`, `npm run test`, `npm run db:check`, `npm run build`, `npm run test:e2e`, and the `fingerprint:*` scripts from `package.json`. These are commands, not claims that the current tree passes every gate. Use non-confidential fixtures and disposable databases for validation. Update `memory/memory.md` before a commit. Do not infer authorization to push, deploy, send real email, or migrate a shared database from a local code task.
