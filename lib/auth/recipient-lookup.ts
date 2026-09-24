import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import { inArray } from "drizzle-orm";
import { normalizeEmail } from "@/lib/auth/email";
import { getDb } from "@/lib/db";
import { userKeyBundles } from "@/lib/db/schema";
import type { PreparedRecipient } from "@/lib/crypto/types";

export async function lookupRecipients(inputEmails: string[]): Promise<PreparedRecipient[]> {
  const emails = [...new Set(inputEmails.map(normalizeEmail))];
  const client = await clerkClient();
  const { data: users } = await client.users.getUserList({ emailAddress: emails, limit: 100 });

  const verifiedByEmail = new Map<string, string>();
  for (const user of users) {
    for (const address of user.emailAddresses) {
      const normalized = normalizeEmail(address.emailAddress);
      if (address.verification?.status === "verified" && emails.includes(normalized)) {
        verifiedByEmail.set(normalized, user.id);
      }
    }
  }

  const userIds = [...new Set(verifiedByEmail.values())];
  const bundles = userIds.length
    ? await getDb().select().from(userKeyBundles).where(inArray(userKeyBundles.clerkUserId, userIds))
    : [];
  const bundleByUser = new Map(bundles.map((bundle) => [bundle.clerkUserId, bundle]));

  return emails.map((recipientEmail) => {
    const userId = verifiedByEmail.get(recipientEmail);
    const bundle = userId ? bundleByUser.get(userId) : undefined;
    if (!userId || !bundle) return { email: recipientEmail, status: "NOT_ENROLLED" };
    return {
      email: recipientEmail,
      status: "READY",
      clerkUserId: userId,
      publicKeyJwk: bundle.publicKeyJwk,
      publicKeyFingerprint: bundle.publicKeyFingerprint,
      keyVersion: bundle.keyVersion,
    };
  });
}
