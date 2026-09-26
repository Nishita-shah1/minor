import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import { inArray } from "drizzle-orm";
import { normalizeEmail } from "@/lib/auth/email";
import { getDb } from "@/lib/db";
import { userOpenpgpKeys } from "@/lib/db/schema";

export async function publishedOpenPgpKeys(emails: string[]) {
  const normalized = [...new Set(emails.map(normalizeEmail))];
  const keys = new Map<string, { armoredPublicKey: string; fingerprint: string }>();
  if (!normalized.length) return keys;
  const client = await clerkClient();
  const { data: users } = await client.users.getUserList({ emailAddress: normalized, limit: 100 });
  const userByEmail = new Map<string, string>();
  for (const user of users) {
    for (const address of user.emailAddresses) {
      const email = normalizeEmail(address.emailAddress);
      if (address.verification?.status === "verified" && normalized.includes(email)) userByEmail.set(email, user.id);
    }
  }
  const userIds = [...new Set(userByEmail.values())];
  const rows = userIds.length
    ? await getDb().select().from(userOpenpgpKeys).where(inArray(userOpenpgpKeys.clerkUserId, userIds))
    : [];
  const byUser = new Map(rows.map((row) => [row.clerkUserId, row]));
  for (const [email, userId] of userByEmail) {
    const row = byUser.get(userId);
    if (row) keys.set(email, { armoredPublicKey: row.armoredPublicKey, fingerprint: row.fingerprint });
  }
  return keys;
}
