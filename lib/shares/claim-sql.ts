import { sql } from "drizzle-orm";

type ClaimInput = {
  shareId: string;
  groupId: string;
  email: string;
  userId: string;
  name: string | null;
  proof: string;
  fingerprint: string;
  keyVersion: number;
  envelopes: Array<{ documentId: string; wrappedFileKey: string; recipientWrappedKey: string }>;
};

export function activateInvitationSql(input: ClaimInput) {
  const { shareId, groupId, email, userId, name, proof, fingerprint, keyVersion, envelopes } = input;
  return sql`
      WITH incoming AS (
        SELECT * FROM jsonb_to_recordset(${JSON.stringify(envelopes)}::jsonb)
        AS e("documentId" uuid, "wrappedFileKey" text, "recipientWrappedKey" text)
      ), activated AS (
        UPDATE shares s SET status = 'ACTIVE', recipient_clerk_user_id = ${userId}, recipient_name = ${name}
        WHERE s.id = ${shareId}::uuid AND s.status = 'AWAITING_RECIPIENT_KEY'
          AND s.recipient_email_normalized = ${email} AND s.group_id = ${groupId}::uuid
          AND EXISTS (SELECT 1 FROM upload_groups g WHERE g.id = s.group_id AND g.status = 'READY')
          AND EXISTS (SELECT 1 FROM share_batches b WHERE b.id = s.batch_id AND (b.expires_at IS NULL OR b.expires_at > now()))
          AND EXISTS (SELECT 1 FROM invitation_grants i WHERE i.share_id = s.id AND i.proof = ${proof})
          AND EXISTS (SELECT 1 FROM user_key_bundles k WHERE k.clerk_user_id = ${userId} AND k.public_key_fingerprint = ${fingerprint} AND k.key_version = ${keyVersion})
          AND (SELECT count(*) FROM incoming) = (SELECT count(*) FROM documents d WHERE d.group_id = s.group_id AND d.status = 'READY')
          AND (SELECT count(DISTINCT "documentId") FROM incoming) = (SELECT count(*) FROM incoming)
          AND NOT EXISTS (SELECT 1 FROM incoming e LEFT JOIN documents d ON d.id = e."documentId" AND d.group_id = s.group_id AND d.status = 'READY' WHERE d.id IS NULL)
          AND EXISTS (SELECT 1 FROM invitation_grants i WHERE i.share_id = s.id
            AND jsonb_array_length(i.fingerprints) = (SELECT count(*) FROM incoming)
            AND NOT EXISTS (SELECT 1 FROM incoming e WHERE (
              SELECT count(*) FROM jsonb_array_elements(i.fingerprints) f
              WHERE f->>'documentId' = e."documentId"::text
            ) <> 1))
          AND NOT EXISTS (SELECT 1 FROM shares other WHERE other.group_id = s.group_id AND other.id <> s.id AND other.recipient_clerk_user_id = ${userId} AND other.status = 'ACTIVE')
        RETURNING s.id
      ), envelopes AS (
        INSERT INTO document_key_envelopes (document_id, clerk_user_id, wrapped_file_key, key_version)
        SELECT e."documentId", ${userId}, e."wrappedFileKey", ${keyVersion}
        FROM incoming e CROSS JOIN activated a
        RETURNING document_id
      ), fingerprints AS (
        INSERT INTO copy_fingerprints (document_id, share_id, owner_wrapped_key, recipient_wrapped_key, profile_id)
        SELECT e."documentId", a.id, f->>'ownerWrappedKey', e."recipientWrappedKey", f->>'profileId'
        FROM incoming e CROSS JOIN activated a JOIN invitation_grants i ON i.share_id = a.id
          CROSS JOIN LATERAL jsonb_array_elements(i.fingerprints) f
        WHERE (f->>'documentId')::uuid = e."documentId"
        RETURNING id
      ), removed_grant AS (
        DELETE FROM invitation_grants i USING activated a
        WHERE i.share_id = a.id
          AND (SELECT count(*) FROM envelopes) = (SELECT count(*) FROM incoming)
          AND (SELECT count(*) FROM fingerprints) = (SELECT count(*) FROM incoming)
        RETURNING i.share_id
      )
      SELECT (SELECT count(*) FROM activated)::int AS activated,
        (SELECT count(*) FROM envelopes)::int AS envelopes,
        (SELECT count(*) FROM fingerprints)::int AS fingerprints,
        (SELECT count(*) FROM removed_grant)::int AS removed_grant`;
}
