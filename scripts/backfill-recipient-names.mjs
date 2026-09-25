// Explicit maintenance action: snapshot Clerk names onto existing share records.
// Never changes recipient identity, email, fingerprint wrappers, or existing names.
import nextEnv from '@next/env';
import { neon } from '@neondatabase/serverless';
import { createRequire } from 'node:module';
const { createClerkClient } = createRequire(import.meta.url)('@clerk/nextjs/server');
nextEnv.loadEnvConfig(process.cwd());
const sql = neon(process.env.DATABASE_URL);
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const rows = await sql`SELECT DISTINCT recipient_clerk_user_id AS id FROM shares WHERE recipient_name IS NULL AND recipient_clerk_user_id IS NOT NULL`;
let updated = 0, unavailable = 0;
for (const row of rows) {
  let user;
  try { user = await clerk.users.getUser(row.id); }
  catch (error) { if (error.status === 404) { unavailable++; continue; } throw new Error('Clerk lookup failed; rerun safely after restoring connectivity.'); }
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.username || null;
  if (!name) { unavailable++; continue; }
  const changed = await sql`UPDATE shares SET recipient_name = ${name} WHERE recipient_clerk_user_id = ${row.id} AND recipient_name IS NULL RETURNING id`;
  updated += changed.length;
}
console.log(JSON.stringify({ updatedShares: updated, unavailableAccounts: unavailable }));
const [counts] = await sql`SELECT count(*)::int AS fingerprints, count(s.recipient_name)::int AS with_name, count(s.recipient_email_normalized)::int AS with_email FROM copy_fingerprints f JOIN shares s ON s.id = f.share_id`;
console.log(JSON.stringify(counts));
