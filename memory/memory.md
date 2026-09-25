# EchoLeaks memory

Updated 2026-09-25. Keep this a short status snapshot; `ARCHITECTURE.md` is the detailed handoff. Check current code before relying on dated experiment notes.

## Stack and built workflows

- Next.js 16.3.3 App Router, React 19, Tailwind v4, Clerk, Neon/PostgreSQL with Drizzle, private Cloudflare R2, Brevo, browser Web Crypto/libsodium/IndexedDB, PDF.js 6.3.289, ONNX Runtime Web 1.30.
- `/dashboard/upload` encrypts files locally (AES-256-GCM) and uploads ciphertext to R2. The owner's RSA-OAEP keypair has an Argon2id-encrypted Neon backup and local IndexedDB copy. Full files are downloaded and decrypted in the browser; chunked streaming is not built.
- `components/dashboard/share-panel.tsx` adds up to 100 recipients to one batch per group and restores old links. Owner Send prepares encrypted key/fingerprint wrappers for enrolled recipients or an encrypted invitation grant for new recipients; Brevo email attempts are tracked per share. CSV/TXT/XLSX support here is recipient-list import only.
- New recipients must sign in with the exact verified Clerk email, set up secure access, decrypt the invitation grant locally, and claim the existing share. `lib/shares/invitation-crypto.ts`, `lib/shares/claim-sql.ts`, and `app/api/shares/[shareId]/{invitation,claim,email}/` own this flow. Email provider acceptance is not delivery confirmation.
- `/share/[shareId]` shows the Clerk account control, checks recipient identity/schedule/status, and locally marks supported PDF pages or static PNG/JPEG before display. The viewer covers content on fullscreen exit, visibility/restoration, authorization loss, or marking failure; no clean fallback is displayed.
- `/dashboard/scan` automatically pages through owned encrypted fingerprint records, unwraps identifiers with the owner's key locally, decodes uploaded evidence locally, and shows name/email/share ID only for one exact match. `components/fingerprint/scan-workspace.tsx`, `copy-lookup.tsx`, `app/api/fingerprints/route.ts`.
- TrustMark Q/BCH_SUPER profile `trustmark-q-lab-v2` uses pinned ONNX assets and a browser worker with WebGPU or local WASM fallback. It is experimental and **not qualified**. `lib/fingerprint/`, `workers/fingerprint.worker.ts`, `scripts/prepare-fingerprint-assets.mjs`.
- Database tables and migrations are in `lib/db/schema.ts` and `drizzle/` (through `0004`); `EXPERIMENTAL_FINGERPRINTING` is opt-in (`.env.example` defaults false). The local Neon migration/flag was previously approved; do not assume any other environment is migrated or enabled.
- Neobrutalist cream/yellow/black UI with rounded controls in `app/globals.css`; landing uses animated WebP for visible hero motion and optional native audio in `components/landing/hero-section.tsx`.

## Current limits and evidence

- Protected renderers: PDF all pages and static PNG/JPEG. Text, CSV, XLSX, DOCX, and phone-photo support are not built/qualified; XLSX import does not mean XLSX viewing.
- PNG/JPEG sources are bounded at 24 MP and 12,000 pixels per side, then fit to a marked surface bounded at 4,194,304 pixels and 4,096 per side. This can reduce detail; arbitrary resolution is not supported.
- Strength-1 synthetic tuning passed 18/18 in each full-page case but only 183/270 crops; 200 negative samples named no recipient. Half-size plus JPEG85 remains a failure. Human readability, held-out format-wide, blind multi-account, and physical-camera gates are missing. See `docs/fingerprinting/evidence/` and `ARCHITECTURE.md` before making reliability claims.
- Authenticated end-to-end invitation/email/view/scan has not been fully demonstrated. Intermittent Clerk lookup failures now return retryable, fail-closed 503s; their environmental cause is unconfirmed. Real Brevo delivery was not verified.
- Owner History is group/share management, not a bounded viewing-session activity product. Deletion removes fingerprint rows only while the experimental flag is enabled; see `lib/server/delete-upload.ts` before changing retention behavior.

## Working notes

- `npm run fingerprint:assets` prepares pinned assets; generated `public/fingerprint-assets/` is not tracked. Relevant scripts: `npm run lint`, `npm run test`, `npm run build`, `npm run db:check`, `npm run test:e2e`, `npm run fingerprint:smoke`, `npm run fingerprint:qualify`.
- The experimental integration was user-approved before screenshot/crop qualification; it did **not** approve a production reliability claim. Do not weaken failed gates. Use disposable databases for migration validation; no push, deployment, or real email is implied by local edits.
