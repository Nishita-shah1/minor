import "server-only";

import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { documentKeyEnvelopes, documents, shares, uploadGroups, copyFingerprints, invitationGrants } from "@/lib/db/schema";
import { experimentalFingerprintingEnabled } from "@/lib/fingerprint/server-config";
import { deleteEncryptedObject } from "@/lib/r2/objects";

async function eraseDocuments(rows: Array<{ id: string; objectKey: string | null }>) {
  await Promise.all(rows.map((row) => row.objectKey ? deleteEncryptedObject(row.objectKey) : Promise.resolve()));
  const ids = rows.map((row) => row.id);
  if (!ids.length) return;
  await getDb().batch([
    getDb().delete(documentKeyEnvelopes).where(inArray(documentKeyEnvelopes.documentId, ids)),
    ...(experimentalFingerprintingEnabled() ? [getDb().delete(copyFingerprints).where(inArray(copyFingerprints.documentId, ids))] : []),
    getDb().update(documents).set({
      status: "DELETED",
      r2ObjectKey: null,
      ciphertextSize: null,
      encryptedMetadata: null,
      metadataIv: null,
      fileIv: null,
      deletedAt: new Date(),
      updatedAt: new Date(),
    }).where(inArray(documents.id, ids)),
  ]);
}

export async function deleteOwnedDocument(documentId: string, ownerClerkUserId: string) {
  const [row] = await getDb().select({
    id: documents.id,
    groupId: documents.groupId,
    objectKey: documents.r2ObjectKey,
    status: documents.status,
  }).from(documents).where(and(eq(documents.id, documentId), eq(documents.ownerClerkUserId, ownerClerkUserId))).limit(1);
  if (!row) return false;
  if (row.status !== "DELETED") {
    await getDb().update(documents).set({ status: "DELETING", updatedAt: new Date() })
      .where(and(eq(documents.id, documentId), ne(documents.status, "DELETED")));
    await getDb().batch([
      getDb().update(shares).set({ status: "REVOKED", revokedAt: new Date() })
        .where(and(eq(shares.groupId, row.groupId), eq(shares.status, "AWAITING_RECIPIENT_KEY"))),
      getDb().delete(invitationGrants).where(inArray(invitationGrants.shareId,
        sql`SELECT id FROM shares WHERE group_id = ${row.groupId}::uuid`)),
    ]);
    await eraseDocuments([row]);
  }
  const remaining = await getDb().select({ id: documents.id }).from(documents)
    .where(and(eq(documents.groupId, row.groupId), ne(documents.status, "DELETED"))).limit(1);
  if (!remaining.length) {
    await getDb().batch([
      getDb().update(uploadGroups).set({ status: "DELETED", deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(uploadGroups.id, row.groupId)),
      getDb().update(shares).set({ status: "DELETED", revokedAt: new Date(), providerMessageId: null }).where(eq(shares.groupId, row.groupId)),
    ]);
  }
  return true;
}

export async function deleteOwnedGroup(groupId: string, ownerClerkUserId: string) {
  const [group] = await getDb().select({ id: uploadGroups.id }).from(uploadGroups)
    .where(and(eq(uploadGroups.id, groupId), eq(uploadGroups.ownerClerkUserId, ownerClerkUserId))).limit(1);
  if (!group) return false;
  const rows = await getDb().select({ id: documents.id, objectKey: documents.r2ObjectKey }).from(documents)
    .where(eq(documents.groupId, groupId));
  await getDb().batch([
    getDb().update(uploadGroups).set({ status: "DELETING", updatedAt: new Date() }).where(eq(uploadGroups.id, groupId)),
    getDb().update(documents).set({ status: "DELETING", updatedAt: new Date() })
      .where(and(eq(documents.groupId, groupId), ne(documents.status, "DELETED"))),
    getDb().update(shares).set({ status: "DELETED", revokedAt: new Date(), providerMessageId: null })
      .where(eq(shares.groupId, groupId)),
    getDb().delete(invitationGrants).where(inArray(invitationGrants.shareId,
      sql`SELECT id FROM shares WHERE group_id = ${groupId}::uuid`)),
  ]);
  await eraseDocuments(rows);
  await getDb().update(uploadGroups).set({ status: "DELETED", deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(uploadGroups.id, groupId));
  return true;
}
