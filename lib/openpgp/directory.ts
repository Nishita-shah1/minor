import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import { getDb } from "@/lib/db";
import { userOpenpgpKeys } from "@/lib/db/schema";
import { knownSenders, mergeNamedKeys, type SenderPublicKey } from "@/lib/openpgp/known-senders";
import { localKeyringSenders } from "@/lib/openpgp/local-keyring";

async function clerkNames(userIds: string[]) {
  const names = new Map<string, { name: string; email: string | null }>();
  if (!userIds.length) return names;
  const client = await clerkClient();
  for (let index = 0; index < userIds.length; index += 100) {
    const batch = userIds.slice(index, index + 100);
    const { data: users } = await client.users.getUserList({ userId: batch, limit: 100 });
    for (const user of users) {
      const display = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
      const primary = user.emailAddresses.find((address) => address.id === user.primaryEmailAddressId);
      const verified = user.emailAddresses.find((address) => address.verification?.status === "verified");
      names.set(user.id, {
        name: display || user.username || primary?.emailAddress || "Unnamed sender",
        email: primary?.emailAddress ?? verified?.emailAddress ?? null,
      });
    }
  }
  return names;
}

export async function listSenderPublicKeys(): Promise<SenderPublicKey[]> {
  let published: SenderPublicKey[] = [];
  try {
    const rows = await getDb().select({
      clerkUserId: userOpenpgpKeys.clerkUserId,
      armoredPublicKey: userOpenpgpKeys.armoredPublicKey,
      fingerprint: userOpenpgpKeys.fingerprint,
    }).from(userOpenpgpKeys);
    let names = new Map<string, { name: string; email: string | null }>();
    try {
      names = await clerkNames([...new Set(rows.map((row) => row.clerkUserId))]);
    } catch (error) {
      console.error("OpenPGP sender name lookup failed", error instanceof Error ? error.name : typeof error);
    }
    published = rows.map((row) => {
      const person = names.get(row.clerkUserId);
      return {
        name: person?.name ?? "Unnamed sender",
        email: person?.email ?? null,
        fingerprint: row.fingerprint,
        armoredPublicKey: row.armoredPublicKey,
      };
    });
  } catch (error) {
    console.error("OpenPGP sender directory lookup failed", error instanceof Error ? error.name : typeof error);
  }
  const local = await localKeyringSenders();
  return mergeNamedKeys(knownSenders, [...local, ...published]);
}
