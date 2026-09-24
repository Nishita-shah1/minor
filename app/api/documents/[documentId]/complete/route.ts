import { and, eq } from "drizzle-orm";
import { ZodError } from "zod";
import { requireVerifiedUser } from "@/lib/auth/current-verified-user";
import { getDb } from "@/lib/db";
import { documentKeyEnvelopes, documents } from "@/lib/db/schema";
import { assertEncryptedObject } from "@/lib/r2/objects";
import { json, requireUuid, safeRouteError } from "@/lib/server/http";
import { completeDocument } from "@/lib/server/validators";
import { refreshUploadGroupStatus } from "@/lib/server/upload-groups";

type Context = { params: Promise<{ documentId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const user = await requireVerifiedUser();
    const documentId = requireUuid((await context.params).documentId);
    const input = completeDocument.parse(await request.json());
    const [document] = await getDb()
      .select()
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.ownerClerkUserId, user.userId)))
      .limit(1);
    if (!document) return json({ error: { code: "NOT_FOUND", message: "Document not found." } }, { status: 404 });
    if (document.status === "READY") return json({ ready: true, documentId });
    if (document.status !== "PENDING") {
      return json({ error: { code: "INVALID_STATE", message: "This document cannot be finalized." } }, { status: 409 });
    }

    if (!document.r2ObjectKey) return json({ error: { code: "INVALID_STATE", message: "Encrypted storage has been removed." } }, { status: 409 });
    await assertEncryptedObject(document.r2ObjectKey, input.ciphertextSize);
    const [, updated] = await getDb().batch([
      getDb().insert(documentKeyEnvelopes).values({
        documentId,
        clerkUserId: user.userId,
        wrappedFileKey: input.ownerWrappedKey,
        keyVersion: input.ownerKeyVersion,
      }).onConflictDoNothing(),
      getDb().update(documents).set({
        status: "READY",
        ciphertextSize: input.ciphertextSize,
        encryptedMetadata: input.encryptedMetadata,
        metadataIv: input.metadataIv,
        fileIv: input.fileIv,
        cryptoVersion: input.cryptoVersion,
        completedAt: new Date(),
        updatedAt: new Date(),
      }).where(and(eq(documents.id, documentId), eq(documents.status, "PENDING"))).returning({ id: documents.id }),
    ]);
    if (!updated.length) return json({ error: { code: "INVALID_STATE", message: "Document finalization raced another request." } }, { status: 409 });
    await refreshUploadGroupStatus(document.groupId);
    return json({ ready: true, documentId });
  } catch (error) {
    if (error instanceof ZodError) return json({ error: { code: "INVALID_REQUEST", message: "Finalization data is invalid." } }, { status: 400 });
    return safeRouteError(error);
  }
}
