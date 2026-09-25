# EchoLeaks Memory

> Keep this file **short**. Append only what changed. See `AGENTS.md` for update rules.

**Updated:** 2026-09-25

## Stack
Next.js 16 (App Router) · React 19 · Tailwind v4 · shadcn + Neobrutalism · Clerk · Neon/Drizzle · private Cloudflare R2 · Brevo · Web Crypto/libsodium/IndexedDB/Workers

## Done
- **Fingerprint planning:** `docs/superpowers/specs/2026-09-25-webgpu-fingerprinting-design.md` replaces the classical design with browser-local TrustMark Q/BCH_SUPER and eight gated tickets: 100% held-out screenshot recovery, then required controlled-camera qualification at ≥95%. New uploads only; legacy recipients must request re-upload. Written-spec review remains pending; no engine is built. `CLAUDE.md` links tracker, triage-label, and single-context conventions in `docs/agents/`.
- **UI:** Neobrutalism theme in `app/globals.css` (cream/yellow, thick borders, hard shadows, `0.75rem` root radius). Buttons and navigation controls stay rounded; sidebar toggles use a yellow, hard-shadowed hamburger control. 54 shadcn/ui components in `components/ui/`. Fonts: Archivo Black (head), Space Grotesk (body).
- **Landing (`/`):** Full-viewport hero — video bg (`public/video/EchoLeaks-Hero-Section-Video.mp4`), tap-to-unmute, hollow **EchoLeaks** title, tagline + **Protect a File** CTA. **Public — no auth required.**
- **Navbar:** Logo left; right = Sign In + Get Started (signed out) or Clerk `UserButton` (signed in).
- **Auth (Clerk):** App **EchoLeaks** (`app_3IZiLv1U2DObIiJ3eMCR6GQxiOc`). Keys in `.env.local` (gitignored). `proxy.ts` public-first; only `/dashboard(.*)` is `auth.protect()`. Dashboard layout also calls `auth.protect({ unauthenticatedUrl: "/sign-in" })`. Landing Sign In / Get Started use a **Clerk modal**. `/sign-in` and `/sign-up` server-redirect to `/dashboard` if already signed in so `<SignIn/>` never remounts. `ClerkProvider` fallback after auth is `/dashboard`. Local JWT-expired / refresh-loop errors were from the machine clock being ~5.5h ahead (RTC stored in IST); NTP fix + restart cleared it.
- **Dashboard:** Protected shared Neobrutalist shell with collapsible sidebar, masked email, Clerk profile, and rounded controls. History now manages owned encrypted groups; Dashboard and Scan remain **Coming soon** placeholders.
- **Protected sharing:** `/dashboard/upload` stages/reorders up to 10 files (25 MiB each, 100 MiB/group), then sequentially encrypts each with AES-256-GCM in a Worker. Groups support per-file progress, retry, discard-failed continuation, and owner deletion. Key recovery uses Argon2id, encrypted backup in Neon, and a non-extractable private key in IndexedDB.
- **Recipients:** Manual or local CSV/TXT/XLSX import (100 max), live Clerk verified-email lookup, per-file browser-wrapped keys, optional group opening/expiry, a post-creation copy/email dialog, and Brevo batch email. `/share/[shareId]` authorizes identity before returning an encrypted manifest and issues one five-minute R2 URL only when a file is selected.
- **Backend:** Drizzle schema/migration, authenticated Route Handlers, private R2 presigning/HEAD verification, Brevo idempotency, revocation/events, no-store responses, and focused crypto/policy/email tests.
- **Database config:** `drizzle.config.ts` loads `.env.local` via `@next/env`; use `db:generate`, `db:check`, `db:migrate`, `db:verify`, and `db:studio`. `DATABASE_URL` stays server-only.
- **Deployment:** Vercel project `anamasgards-projects/echoleaks` has the required Clerk, Neon, R2, Brevo, and app variables in Production and Preview. Remote `APP_URL=https://echoleaks.vercel.app`; local `.env.local` keeps `http://localhost:3000` for local share links.
- **Vercel build:** The project targets Node 24; `@types/node` is pinned to `^24` so Vitest 5 dependency installation succeeds on Vercel.
- **Hero CTA:** Protect a File → `/dashboard` (redirects to sign-in if logged out).
- **Assets:** Favicon/logo `public/io.github.lo2dev.Echo.svg`

## Key files
`components/dashboard/upload-workspace.tsx` · `components/dashboard/share-panel.tsx` · `app/api/` · `app/share/` · `lib/crypto/` · `workers/` · `lib/db/schema.ts` · `drizzle/` · `.env.example`

## Not built / not verified live
Neon connectivity and all seven Drizzle tables were verified after `drizzle/0001_tearful_betty_brant.sql`; R2, Clerk, and Brevo API credentials were also verified live. A real two-account multi-file share/email/decrypt/delete rehearsal remains unverified. No large-file streaming, delivery webhooks/durable deletion queue, automatic post-enrollment share finalization, or leak scanning/fingerprinting.
