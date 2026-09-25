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
