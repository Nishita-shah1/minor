import { sql } from "drizzle-orm";

// Execute after locking the owned upload-group row in the same transaction.
// A fresh statement snapshot sees recipients appended by preceding transactions.
export function appendRecipientsSql(groupId: string, ownerId: string, recipients: Array<{
  recipientName?: string | null; id: string; email: string; userId: string | null; status: string;
  keyVersion: number | null; envelopes: Array<{ documentId: string; wrappedFileKey: string; fingerprint?: {ownerWrappedKey: string; recipientWrappedKey: string; profileId: string} }>;
}>, fingerprintsEnabled = false) {
  return sql`
    WITH incoming AS (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(recipients)}::jsonb)
      AS r(id uuid, "recipientName" text, email text, "userId" text, status text, "keyVersion" integer, envelopes jsonb)
    ), batch AS (
      SELECT b.* FROM share_batches b JOIN upload_groups g ON g.id = b.group_id
      WHERE g.id = ${groupId}::uuid AND g.owner_clerk_user_id = ${ownerId} AND g.status = 'READY'
    ), additions AS (
      SELECT r.* FROM incoming r WHERE NOT EXISTS (
        SELECT 1 FROM shares s WHERE s.group_id = ${groupId}::uuid
        AND (s.recipient_email_normalized = r.email OR (r."userId" IS NOT NULL AND s.recipient_clerk_user_id = r."userId"))
      )
    ), allowance AS (
      SELECT (SELECT count(*) FROM shares WHERE group_id = ${groupId}::uuid)
        + (SELECT count(*) FROM additions) <= 100 AS allowed
    ), inserted AS (
      INSERT INTO shares (id, batch_id, group_id, sender_clerk_user_id, recipient_clerk_user_id, recipient_email_normalized, recipient_name, permission, status)
      SELECT r.id, b.id, b.group_id, b.sender_clerk_user_id, r."userId", r.email, r."recipientName", 'VIEW_ONLY'::share_permission, r.status::share_status
      FROM additions r CROSS JOIN batch b CROSS JOIN allowance a
      WHERE a.allowed AND b.email_status <> 'SENDING'
      RETURNING id
    ), envelopes AS (
      INSERT INTO document_key_envelopes (document_id, clerk_user_id, wrapped_file_key, key_version)
      SELECT (e->>'documentId')::uuid, r."userId", e->>'wrappedFileKey', r."keyVersion"
      FROM incoming r JOIN inserted i ON i.id = r.id CROSS JOIN LATERAL jsonb_array_elements(r.envelopes) e
      ON CONFLICT DO NOTHING RETURNING document_id
    )
    ${fingerprintsEnabled ? sql`, fingerprint_insert AS (
      INSERT INTO copy_fingerprints (document_id, share_id, owner_wrapped_key, recipient_wrapped_key, profile_id)
      SELECT (e->>'documentId')::uuid, targets.id, e->'fingerprint'->>'ownerWrappedKey', e->'fingerprint'->>'recipientWrappedKey', e->'fingerprint'->>'profileId'
      FROM incoming r JOIN LATERAL (
        SELECT i.id FROM inserted i WHERE i.id = r.id
        UNION ALL
        SELECT s.id FROM shares s CROSS JOIN batch b WHERE s.group_id = b.group_id
          AND s.recipient_email_normalized = r.email AND s.recipient_clerk_user_id = r."userId"
          AND s.status = 'ACTIVE' AND b.email_status <> 'SENDING'
      ) targets ON true CROSS JOIN LATERAL jsonb_array_elements(r.envelopes) e
      ON CONFLICT DO NOTHING RETURNING id
    )` : sql``}
    SELECT (SELECT allowed FROM allowance) AS allowed,
      EXISTS(SELECT 1 FROM batch) AS available,
      EXISTS(SELECT 1 FROM batch WHERE email_status = 'SENDING') AS emailing,
      (SELECT count(*) FROM inserted)::int AS added,
      (SELECT count(*) FROM envelopes)::int AS envelopes
  `;
}
