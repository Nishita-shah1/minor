# Existing links and additional recipients

User-approved behavior: reopen saved secure links, append recipients to the same batch, show the copy/email dialog immediately after creation, and allow explicit email resends. Existing recipient IDs, batch permission, and schedule remain unchanged. No fingerprint integration is included.

Implemented owner-only, no-store GET of saved links; locked atomic append with a total 100-recipient cap; account/email deduplication preserving revoked shares; History access to link management; copy feedback/manual clipboard fallback; explicit Brevo attempt IDs and concurrent-send exclusion. Owner keys are required only for wrapping keys for additional recipients, not viewing saved links. Newly enrolled recipients previously stored as waiting are not upgraded automatically.

Verification: 67 unit tests and lint passed during implementation. Disposable PostgreSQL passed append/retry, stable IDs, envelope persistence, account deduplication, revocation preservation, owner isolation, send exclusion, concurrent cap, and deletion checks. Real React popup with mocked services passed creation, copy, reopening, reload, append, and resend checks. No real email was sent. The first disposable container readiness check reached PostgreSQL's temporary startup server; checking TCP readiness fixed this and the rerun passed.

The user then requested fast completion without all tests. Full build/E2E and final full-suite reruns were skipped. No shared database migration, push, or deployment.

Reproduce focused checks:

- `node --import tsx scripts/check-share-persistence.ts` (creates/removes disposable PostgreSQL container)
- `node scripts/check-share-ui.mjs` (mocked-service browser component check)
