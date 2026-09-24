# EchoLeaks

EchoLeaks is a Next.js application for client-side encrypted file sharing. Files are staged into groups and independently encrypted in a browser Worker before upload, private Cloudflare R2 stores ciphertext only, and every recipient gets a separately wrapped key for every file. Clerk authenticates both the bound user ID and verified email before the server releases an encrypted manifest or a short-lived ciphertext URL.

This is a prototype implementation of client-side E2EE/server-blind storage. It has not received an independent cryptographic audit.

## Local setup

Requirements: Node.js 20+, npm, a Clerk application, Neon database, private Cloudflare R2 bucket, and Brevo transactional sender.

```bash
cp .env.example .env.local
npm install
npm run db:migrate
npm run dev
```

Open `http://localhost:3000`. Browser cryptography works on localhost or HTTPS because both are secure contexts.

## Environment

Set the Clerk variables plus:

```text
DATABASE_URL
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME
BREVO_API_KEY
BREVO_SENDER_EMAIL
BREVO_SENDER_NAME
APP_URL
```

Use `APP_URL=http://localhost:3000` locally and `APP_URL=https://echoleaks.vercel.app` in Vercel. Database, R2, and Brevo credentials are server-only and must never use a `NEXT_PUBLIC_` prefix.

## Neon and Drizzle

1. Create a Neon PostgreSQL database.
2. Copy its pooled connection string into `DATABASE_URL`.
3. Apply the checked-in migrations:

```bash
npm run db:migrate
```

After schema changes, generate a new migration with `npm run db:generate` and review the SQL before applying it.

Useful database commands:

```bash
npm run db:generate  # Generate checked-in SQL migrations
npm run db:check     # Validate migration consistency
npm run db:migrate   # Apply migrations after DATABASE_URL is configured
npm run db:verify    # Verify Neon, Drizzle, and all expected tables
npm run db:studio    # Open Drizzle Studio
```

`drizzle.config.ts` loads the root `.env.local` through Next.js's official `@next/env` loader. Keep `DATABASE_URL` server-only; never rename it with a `NEXT_PUBLIC_` prefix.

After you paste the Neon pooled connection string into `.env.local`, run:

```bash
npm run db:migrate
npm run db:verify
```

Add the same `DATABASE_URL` to the Vercel project's Development, Preview, and Production environments before deploying database-backed routes.

## Private Cloudflare R2

Create a private bucket and an R2 API token with object read/write access only to that bucket. Do not enable public bucket access.

Apply this browser CORS policy, replacing the production origin if necessary:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3000",
      "https://echoleaks.vercel.app"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

EchoLeaks signs one five-minute URL for one object and operation. Uploads use `application/octet-stream`; original filenames and MIME types are encrypted metadata.

## Brevo transactional email

1. Create a Brevo account and API key.
2. Verify `BREVO_SENDER_EMAIL` using Brevo's sender verification flow.
3. Rehearse delivery to the actual demo inboxes and check spam folders.

For the prototype, sender-email verification can work without owning a domain. A properly authenticated sending domain remains the production configuration. EchoLeaks uses one personalized message version per recipient, stores Brevo message IDs, and reports **Email request accepted** rather than claiming delivery. The logged-in user's verified Clerk email is used only as Reply-To; it is not spoofed as the From address.

## Clerk requirements

- Configure both localhost and `https://echoleaks.vercel.app` as allowed application origins/redirects.
- Every recipient must sign in with the exact verified email authorized by the sender.
- Recipients must enroll an EchoLeaks encryption public key before receiving a decryptable share.
- A forwarded URL grants no access by itself.

## Prototype limits

- 10 files and 100 MiB per group, with a 25 MiB per-file limit. Files are encrypted sequentially and each operation currently holds one complete file in memory.
- 100 recipients per batch.
- Each group has one permission and an optional opening/expiry schedule shared by all recipients.
- CSV, TXT, and XLSX recipient lists are parsed locally and never uploaded. Legacy XLS is intentionally not accepted.
- Images, PDFs, text, JSON, and common source files can be previewed locally.
- Other file types can be locally downloaded only with `VIEW_AND_DOWNLOAD`.
- `VIEW_ONLY` removes the download control but cannot prevent screenshots or copying.
- Revocation blocks future access responses but cannot remove copies already decrypted.
- Losing both the recovery passphrase and every trusted device makes old files unrecoverable.

Large-file streaming, authenticated sending domains, delivery webhooks, durable workflow queues, and additional viewers are future work.

The uploader can remove an individual encrypted file or a complete group from History. EchoLeaks deletes R2 ciphertext and cryptographic access material while retaining minimal status and audit timestamps. Retryable synchronous deletion is used for the prototype; a durable cleanup workflow is recommended for production.

## Verification

```bash
npm run lint
npm run test
npm run build
npm run test:e2e
```

For a manual ciphertext check, upload a file containing a recognizable marker, download the resulting R2 object through administrative tooling, and confirm the original bytes and marker do not appear. Then verify a wrong Clerk account receives `403`, the correct recipient decrypts locally, and modifying one ciphertext byte makes AES-GCM decryption fail.

## Threat-model boundary

The backend stores authorization records, encrypted metadata, and wrapped keys, while R2 stores ciphertext. It must never receive file plaintext, raw AES keys, recovery passphrases, or plaintext private keys. This does not protect against a compromised recipient device, malicious browser extension, compromised frontend deployment, or an authorized recipient intentionally redistributing decrypted content.
