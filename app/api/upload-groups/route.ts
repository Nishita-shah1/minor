import { desc, eq, inArray } from "drizzle-orm";
import { ZodError } from "zod";
import { requireVerifiedUser } from "@/lib/auth/current-verified-user";
import { CRYPTO_VERSION } from "@/lib/crypto/constants";
import { getDb } from "@/lib/db";
import { documents, uploadGroups, userKeyBundles } from "@/lib/db/schema";
import { createR2ObjectKey } from "@/lib/r2/objects";
import { json, safeRouteError } from "@/lib/server/http";
import { createUploadGroup } from "@/lib/server/validators";

export async function POST(request: Request) {
  try {
    const user = await requireVerifiedUser();
    const input = createUploadGroup.parse(await request.json());
    const [bundle] = await getDb().select({
      keyVersion: userKeyBundles.keyVersion,
      publicKeyJwk: userKeyBundles.publicKeyJwk,
    }).from(userKeyBundles).where(eq(userKeyBundles.clerkUserId, user.userId)).limit(1);
    if (!bundle) return json({ error: { code: "KEY_VAULT_REQUIRED", message: "Set up your encryption key first." } }, { status: 409 });

    const groupId = crypto.randomUUID();
    const slots = Array.from({ length: input.fileCount }, () => ({
      id: crypto.randomUUID(),
      groupId,
      ownerClerkUserId: user.userId,
      r2ObjectKey: createR2ObjectKey(user.userId),
      cryptoVersion: CRYPTO_VERSION,
    }));
    await getDb().batch([
      getDb().insert(uploadGroups).values({
        id: groupId,
        ownerClerkUserId: user.userId,
        status: "PROTECTING",
        expectedFileCount: input.fileCount,
      }),
      getDb().insert(documents).values(slots),
    ]);
    return json({
      groupId,
      documents: slots.map((slot) => ({ documentId: slot.id })),
      cryptoVersion: CRYPTO_VERSION,
      ownerPublicKeyJwk: bundle.publicKeyJwk,
      ownerKeyVersion: bundle.keyVersion,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) return json({ error: { code: "INVALID_GROUP", message: "Choose between 1 and 10 files." } }, { status: 400 });
    return safeRouteError(error);
  }
}

export async function GET() {
  try {
    const user = await requireVerifiedUser();
    const groups = await getDb().select({
      id: uploadGroups.id,
      status: uploadGroups.status,
      expectedFileCount: uploadGroups.expectedFileCount,
      createdAt: uploadGroups.createdAt,
      deletedAt: uploadGroups.deletedAt,
    }).from(uploadGroups)
      .where(eq(uploadGroups.ownerClerkUserId, user.userId))
      .orderBy(desc(uploadGroups.createdAt));
    const groupIds = groups.map((group) => group.id);
    const files = groupIds.length ? await getDb().select({
      id: documents.id,
      groupId: documents.groupId,
      status: documents.status,
    }).from(documents).where(inArray(documents.groupId, groupIds)) : [];
    return json({ groups: groups.map((group) => ({
      ...group,
      createdAt: group.createdAt.toISOString(),
      deletedAt: group.deletedAt?.toISOString() ?? null,
      documents: files.filter((file) => file.groupId === group.id).map((file) => ({ id: file.id, status: file.status })),
    })) });
  } catch (error) {
    return safeRouteError(error);
  }
}
