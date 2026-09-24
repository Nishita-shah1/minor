export type ShareAccessState = {
  status: "AWAITING_RECIPIENT_KEY" | "ACTIVE" | "REVOKED" | "EXPIRED" | "DELETED";
  groupStatus: "PROTECTING" | "PARTIAL" | "READY" | "DELETING" | "DELETED";
  availableFrom: Date | null;
  expiresAt: Date | null;
  recipientClerkUserId: string | null;
  recipientEmailNormalized: string;
};

export type ShareAccessDecision =
  | "AUTHORIZED"
  | "FORBIDDEN"
  | "NOT_YET_AVAILABLE"
  | "EXPIRED"
  | "DELETED"
  | "REVOKED";

export function evaluateShareAccess(
  share: ShareAccessState,
  userId: string,
  verifiedEmails: string[],
  now = new Date(),
): ShareAccessDecision {
  if (share.recipientClerkUserId !== userId || !verifiedEmails.includes(share.recipientEmailNormalized)) {
    return "FORBIDDEN";
  }
  if (share.status === "DELETED" || share.groupStatus === "DELETED") return "DELETED";
  if (share.status === "REVOKED" || share.groupStatus === "DELETING") return "REVOKED";
  if (share.status !== "ACTIVE" || share.groupStatus !== "READY") return "FORBIDDEN";
  if (share.availableFrom && now < share.availableFrom) return "NOT_YET_AVAILABLE";
  if (share.expiresAt && now >= share.expiresAt) return "EXPIRED";
  return "AUTHORIZED";
}

export function canAccessShare(
  share: ShareAccessState,
  userId: string,
  verifiedEmails: string[],
  now = new Date(),
) {
  return evaluateShareAccess(share, userId, verifiedEmails, now) === "AUTHORIZED";
}
