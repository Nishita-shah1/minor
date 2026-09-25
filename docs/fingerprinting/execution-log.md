# Delivery and local verification log

2026-09-25. Integration remains gated by the approved design. The user separately requested a working `/dashboard/scan` UI for local manual testing before qualification; that UI must clearly show its experimental status and cannot invent recipient associations.

## 1. Alignment and bounded investigation

Implemented four-point perspective reconstruction with observed-only coverage, clean fill, minimum 50% coverage, geometry validation, and a maximum of one direct plus one aligned decode. Conflicting valid identifiers and invalid geometry abstain. Single-candidate resolution still requires exact decoded identity. These are experiment primitives, not qualified crop recovery.

Before commit:

| Command | Result |
|---|---|
| `npm test` | PASS: 60 tests, 13 files |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `npx tsc --noEmit` | PASS after build completed |
| `npm run db:check` | PASS: migration metadata only; no database changed |
| `npm run test:e2e` | PASS: existing unauthenticated share boundary, 1 test |

The first standalone typecheck overlapped build regeneration of `.next/types` and encountered missing generated files. The completed build's typecheck and the subsequent standalone typecheck passed. Subsequent build/typecheck runs are sequential.

## Remaining gates

Representative tuning and held-out PDF/image matrix, crop cells, 200 distinct negatives, human readability, blind demonstrations, and physical-camera qualification are not passed. `trustmark-q-v1` is not issued or frozen. Recipient issuance/viewer integration remains blocked until screenshot qualification and the required human checks pass.

## 2. Working local Scan UI

The user's requested `/dashboard/scan` route now mounts `ScanWorkspace`: PNG/JPEG input, local decoding, recovered identifier, explicit unqualified/no-recipient-records messaging, four-point alignment with a local original, cancel/clear, and a local marked-test-copy generator with PNG export. No candidate names are fabricated. The generator/export is an experimental owner test tool, not a recipient viewer. PDF originals currently use page 1.

Before commit: `npm test` PASS (60/13); `npm run lint`, `npm run build`, subsequent `npx tsc --noEmit`, `npm run db:check` PASS; `npm run test:e2e` PASS (1 existing auth-boundary test).

`FINGERPRINT_VULKAN=1 npm run fingerprint:scan-ui` passed 8 checks using the actual React component and real worker: encoding, exact pixels, PNG download/re-upload, visible-canvas screenshot re-upload, aligned two-attempt decoding, clearing, unmarked abstention, and local GET-only asset requests. Browser errors: none. Evidence: `evidence/2026-09-25-scan-ui/browser.json`.

The component harness mounts the same component in an isolated localhost page; it does not claim an authenticated three-account application demonstration or full-app analytics privacy qualification. The actual route remains behind existing Clerk protection. Diagnostic Linux Vulkan flags are still recorded and required by this test machine.

## 3. Reproducible screenshot tuning and crop upload

Pinned PDF.js 6.3.289 and its local worker/fonts/cmaps/WASM assets. Added six-document synthetic tuning (four actual PDFs, two PNGs), three identifiers, 20 required cases and five experimental cases, candidate sets 1/3/100, and 200 distinct negative inputs. `fingerprint:qualify` records actual final-canvas captures; `scripts/fingerprint/summarize.mjs` generates counts and a paired human-review page. Narrow evidence crops now load without the encoder's aspect-ratio restriction; unsupported direct scans abstain.

**Recovery gate FAIL at strength 1:** full-page native, 75%, 50%, JPEG85, and 50%+JPEG85 each passed 18/18. Across 270 crop cases, 183 recovered and 87 missed. No wrong attributions were observed in the 200 distinct negative tests (40 each unmarked, foreign mark, low-information, unsupported crop, and withheld candidate). No processing failures/browser errors. Candidate-count results reuse capture decoding and are not independent captures. Raw evidence and per-case counts: `evidence/2026-09-25-screenshot-tuning/`. Other strengths were not evaluated in this run. These synthetic tuning results are not held-out qualification.

Before commit: `npm test` PASS (60 tests/13 files); lint, build, subsequent typecheck, and db:check PASS; existing E2E PASS (1); real Scan UI harness PASS (9 checks, including narrow evidence upload). No database migration, push, deployment, or email. The UI harness mounts the actual component and worker independently of Clerk; full authenticated application demonstration remains NOT RUN.

An initial qualification run lost its output when the independent Playwright suite cleaned `test-results`. The complete run above uses `.fingerprint-results` and survived a repeated E2E run. ESLint initially traversed generated bundles there; its generated-output ignore now matches that directory. Both corrected checks were rerun.

Human readability and blind demonstrations, held-out evaluation, camera testing, and complete privacy/performance qualification remain NOT RUN. No production profile was frozen. Tickets 2–8 remain blocked by ticket 1's failed/missing gates. The working Scan UI is the user-authorized experimental local test surface, not real recipient attribution.

## 4. Explicit experimental integration approval

The user subsequently approved recipient integration despite the failed crop gate and separately approved the Neon migration and local activation. Implementation and focused evidence are recorded in `experimental-integration.md`. This supersedes the earlier integration block only; no qualification claims changed.
