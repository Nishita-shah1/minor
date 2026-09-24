import { openDB } from "idb";

const DATABASE_NAME = "echoleaks-key-vault";
const STORE_NAME = "private-keys";

async function database() {
  return openDB(DATABASE_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    },
  });
}

export type LocalKeyRecord = { privateKey: CryptoKey; fingerprint: string };

export async function getLocalPrivateKey(clerkUserId: string): Promise<LocalKeyRecord | undefined> {
  return (await database()).get(STORE_NAME, clerkUserId);
}

export async function saveLocalPrivateKey(clerkUserId: string, record: LocalKeyRecord) {
  await (await database()).put(STORE_NAME, record, clerkUserId);
}

export async function forgetLocalPrivateKey(clerkUserId: string) {
  await (await database()).delete(STORE_NAME, clerkUserId);
}
