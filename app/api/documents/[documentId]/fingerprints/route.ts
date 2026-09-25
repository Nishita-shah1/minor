import { and, eq } from "drizzle-orm";
import { requireVerifiedUser } from "@/lib/auth/current-verified-user";
import { getDb } from "@/lib/db";
import { copyFingerprints, documents, shares } from "@/lib/db/schema";
import { experimentalFingerprintingEnabled } from "@/lib/fingerprint/server-config";
import { json, requireUuid, safeRouteError } from "@/lib/server/http";
export async function GET(_request: Request, context: { params: Promise<{documentId: string}> }) {
  try {
    const user = await requireVerifiedUser();
    const documentId = requireUuid((await context.params).documentId);
    const [document] = await getDb().select({id: documents.id}).from(documents).where(and(eq(documents.id, documentId), eq(documents.ownerClerkUserId, user.userId), eq(documents.status, "READY"))).limit(1);
    if (!document) return json({error:{code:"NOT_FOUND",message:"Owned document not found."}},{status:404});
    if (!experimentalFingerprintingEnabled()) return json({error:{code:"NOT_ENABLED",message:"Experimental recipient lookup is awaiting database setup."}},{status:409});
    const candidates = await getDb().select({ id: shares.id, recipientEmail: shares.recipientEmailNormalized, ownerWrappedKey: copyFingerprints.ownerWrappedKey, profileId: copyFingerprints.profileId }).from(copyFingerprints).innerJoin(shares, eq(shares.id, copyFingerprints.shareId)).where(eq(copyFingerprints.documentId, documentId));
    return json({documentId,candidates});
  } catch (error) { return safeRouteError(error); }
}
