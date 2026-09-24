import { requireVerifiedUser } from "@/lib/auth/current-verified-user";
import { CRYPTO_VERSION } from "@/lib/crypto/constants";
import { getDb } from "@/lib/db";
import { documents, uploadGroups, userKeyBundles } from "@/lib/db/schema";
import { createR2ObjectKey, presignEncryptedUpload } from "@/lib/r2/objects";
import { json, safeRouteError } from "@/lib/server/http";
import { eq } from "drizzle-orm";

export async function POST() {
  try {
    const user = await requireVerifiedUser();
    const [bundle] = await getDb()
      .select({ keyVersion: userKeyBundles.keyVersion, publicKeyJwk: userKeyBundles.publicKeyJwk })
      .from(userKeyBundles)
      .where(eq(userKeyBundles.clerkUserId, user.userId))
      .limit(1);
    if (!bundle) {
      return json({ error: { code: "KEY_VAULT_REQUIRED", message: "Set up your encryption key first." } }, { status: 409 });
    }

    const objectKey = createR2ObjectKey(user.userId);
    const groupId = crypto.randomUUID();
    const documentId = crypto.randomUUID();
    await getDb().batch([
      getDb().insert(uploadGroups).values({ id: groupId, ownerClerkUserId: user.userId, expectedFileCount: 1 }),
      getDb().insert(documents).values({ id: documentId, groupId, ownerClerkUserId: user.userId, r2ObjectKey: objectKey, cryptoVersion: CRYPTO_VERSION }),
    ]);
    const upload = await presignEncryptedUpload(objectKey);
    return json({
      documentId,
      groupId,
      uploadUrl: upload.uploadUrl,
      expiresInSeconds: upload.expiresInSeconds,
      cryptoVersion: CRYPTO_VERSION,
      ownerPublicKeyJwk: bundle.publicKeyJwk,
      ownerKeyVersion: bundle.keyVersion,
    }, { status: 201 });
  } catch (error) {
    return safeRouteError(error);
  }
}
