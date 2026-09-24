import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { documents, uploadGroups } from "@/lib/db/schema";

export async function refreshUploadGroupStatus(groupId: string) {
  const [group] = await getDb().select({ status: uploadGroups.status }).from(uploadGroups)
    .where(eq(uploadGroups.id, groupId)).limit(1);
  if (!group || group.status === "DELETING" || group.status === "DELETED") return group?.status;
  const rows = await getDb().select({ status: documents.status }).from(documents)
    .where(eq(documents.groupId, groupId));
  const pending = rows.some((row) => row.status === "PENDING");
  const failed = rows.some((row) => row.status === "FAILED");
  const ready = rows.filter((row) => row.status === "READY").length;
  const status = pending ? "PROTECTING" as const
    : failed ? "PARTIAL" as const
      : ready > 0 ? "READY" as const
        : "PARTIAL" as const;
  await getDb().update(uploadGroups).set({ status, updatedAt: new Date() })
    .where(and(eq(uploadGroups.id, groupId), inArray(uploadGroups.status, ["PROTECTING", "PARTIAL"])));
  return status;
}
