<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# EchoLeaks agent rules

## Start here

- Read `ARCHITECTURE.md` for the current data flows, trust boundaries, code map, and known gaps. `memory/memory.md` is a short status snapshot. Treat older plans and experiment logs as historical evidence; confirm behavior in current code before changing it.
- Keep browser-local document decryption, invitation-grant decryption, TrustMark encoding, and screenshot decoding local. Server routes authorize access and store ciphertext, encrypted key envelopes, and share metadata. Never add a server-side plaintext or screenshot-analysis path by accident.
- `trustmark-q-lab-v2` is **experimental and unqualified**. Do not present a successful lab round trip as proof of screenshot, crop, format-wide, or phone-photo reliability. Preserve explicit inconclusive/failure states and fail closed rather than showing an unmarked protected document.
- Make database changes through `lib/db/schema.ts` and reviewed `drizzle/` migrations. Validate migrations on a disposable database; do not apply them to a shared database, send real email, push, or deploy without authorization for that action.

## Memory (`memory/memory.md`)

**Before every commit**, update `memory/memory.md` with what changed in this session.

- Keep it **short, precise, and simple** — future sessions append here; avoid bloat so context stays usable.
- Only record: stack facts, what's built, key file paths, what's not built yet, and non-obvious layout/config notes.
- Do **not** paste long prose, full component lists, or duplicate `AGENTS.md` rules.

## Design — Neobrutalism

Always follow **Neobrutalism** (neobrutalism.com / `@neobrutalism` registry):

- Thick black borders, hard offset shadows (no blur), high-contrast palette (cream bg, yellow primary, black borders)
- Use existing theme tokens in `app/globals.css` and components from `components/ui/`
- Add UI via: `npx shadcn@latest add @neobrutalism/<name>`

**Rounded corners (mandatory):** Every button, navbar control, input, card, and interactive element must have clearly visible rounded corners. Prefer `rounded-full` for buttons and navigation items, and `rounded-lg` / `rounded-xl` for panels. Never ship sharp square UI chrome or reset the root `--radius` to `0`.

## Landing UX (current)

- Video-first, minimal, single viewport — no hero clutter
- Prefer Neobrutalist CTAs with rounded-full + border-2 + shadow-md hover lift
