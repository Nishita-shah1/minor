import { and, asc, eq, gt } from "drizzle-orm";
import { requireVerifiedUser } from "@/lib/auth/current-verified-user";
import { getDb } from "@/lib/db";
import { copyFingerprints, documents, shares } from "@/lib/db/schema";
import { experimentalFingerprintingEnabled } from "@/lib/fingerprint/server-config";
import { json, requireUuid, safeRouteError } from "@/lib/server/http";

// Only encrypted owner envelopes leave the server. IDs are derived in the browser.
export async function GET(request: Request) {
  try {
    const user = await requireVerifiedUser();
    if (!experimentalFingerprintingEnabled()) return json({ error: { message: "Recipient lookup is not enabled." } }, { status: 409 });
    const cursor = new URL(request.url).searchParams.get("after");
    if (cursor) requireUuid(cursor);
    const rows = await getDb().select({
      id: copyFingerprints.id,
      documentId: copyFingerprints.documentId,
      shareId: shares.id,
      recipientName: shares.recipientName,
      recipientEmail: shares.recipientEmailNormalized,
      ownerWrappedKey: copyFingerprints.ownerWrappedKey,
      profileId: copyFingerprints.profileId,
    }).from(copyFingerprints)
      .innerJoin(documents, eq(documents.id, copyFingerprints.documentId))
      .innerJoin(shares, eq(shares.id, copyFingerprints.shareId))
      .where(and(eq(documents.ownerClerkUserId, user.userId), eq(documents.status, "READY"),
        cursor ? gt(copyFingerprints.id, cursor) : undefined))
      .orderBy(asc(copyFingerprints.id)).limit(201);
    const candidates = rows.slice(0, 200);
    return json({ candidates, nextCursor: rows.length > 200 ? candidates.at(-1)!.id : null });
  } catch (error) { return safeRouteError(error); }
}
