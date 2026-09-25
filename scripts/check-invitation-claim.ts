// Exercises the claim statement on a throwaway PostgreSQL container.
// No application credentials, shared database, or email provider are used.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { PgDialect } from "drizzle-orm/pg-core";
import { activateInvitationSql } from "../lib/shares/claim-sql";

const container = `echoleaks-invite-check-${randomUUID()}`;

function docker(args: string[], input?: string) {
  const result = spawnSync("docker", args, { input, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}

function query(statement: string) {
  return docker(["exec", "-i", container, "psql", "-U", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], statement);
}

function executableSql(input: Parameters<typeof activateInvitationSql>[0]) {
  const compiled = new PgDialect().sqlToQuery(activateInvitationSql(input));
  return compiled.sql.replace(/\$(\d+)/g, (_, index: string) =>
    `'${String(compiled.params[Number(index) - 1]).replaceAll("'", "''")}'`);
}

async function main() {
  docker(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=throwaway", "postgres:17.5"]);
  try {
    for (let attempt = 0; attempt < 60; attempt++) {
      const ready = spawnSync("docker", ["exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]);
      if (ready.status === 0) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    for (const file of readdirSync("drizzle").filter(file => file.endsWith(".sql")).sort()) {
      query(readFileSync(`drizzle/${file}`, "utf8"));
    }
    const groupId = randomUUID(), batchId = randomUUID(), documentId = randomUUID(), shareId = randomUUID();
    query(`INSERT INTO upload_groups(id, owner_clerk_user_id, status, expected_file_count) VALUES('${groupId}', 'owner', 'READY', 1);
      INSERT INTO documents(id, group_id, owner_clerk_user_id, status) VALUES('${documentId}', '${groupId}', 'owner', 'READY');
      INSERT INTO share_batches(id, group_id, sender_clerk_user_id, permission) VALUES('${batchId}', '${groupId}', 'owner', 'VIEW_ONLY');
      INSERT INTO shares(id, batch_id, group_id, sender_clerk_user_id, recipient_email_normalized, permission, status)
        VALUES('${shareId}', '${batchId}', '${groupId}', 'owner', 'alice@example.test', 'VIEW_ONLY', 'AWAITING_RECIPIENT_KEY');
      INSERT INTO user_key_bundles(clerk_user_id, public_key_jwk, public_key_fingerprint, encrypted_private_key, private_key_iv, kdf_salt, kdf_parameters)
        VALUES('alice-user', '{}', 'fingerprint', 'ciphertext', 'iv', 'salt', '{}');
      INSERT INTO invitation_grants(share_id, ciphertext, iv, proof, owner_wrapped_secret, fingerprints)
        VALUES('${shareId}', 'ciphertext', 'iv', 'valid-proof', 'owner-secret', '[{"documentId":"${documentId}","ownerWrappedKey":"owner-wrapper","profileId":"trustmark-q-lab-v2"}]');`);
    const claim = { shareId, groupId, email: "alice@example.test", userId: "alice-user", name: "Alice",
      proof: "valid-proof", fingerprint: "fingerprint", keyVersion: 1,
      envelopes: [{ documentId, wrappedFileKey: "recipient-document-wrapper", recipientWrappedKey: "recipient-fingerprint-wrapper" }] };
    assert.equal(query(executableSql({ ...claim, proof: "wrong" })), "0|0|0|0");
    assert.equal(query(executableSql({ ...claim, email: "wrong@example.test" })), "0|0|0|0");
    assert.equal(query(executableSql({ ...claim, fingerprint: "changed-key" })), "0|0|0|0");
    query(`UPDATE share_batches SET expires_at=now()-interval '1 minute' WHERE id='${batchId}'`);
    assert.equal(query(executableSql(claim)), "0|0|0|0");
    query(`UPDATE share_batches SET expires_at=NULL WHERE id='${batchId}'`);
    query(`UPDATE shares SET status='REVOKED' WHERE id='${shareId}'`);
    assert.equal(query(executableSql(claim)), "0|0|0|0");
    query(`UPDATE shares SET status='AWAITING_RECIPIENT_KEY' WHERE id='${shareId}'`);
    query(`UPDATE upload_groups SET status='DELETING' WHERE id='${groupId}'`);
    assert.equal(query(executableSql(claim)), "0|0|0|0");
    query(`UPDATE upload_groups SET status='READY' WHERE id='${groupId}'`);
    assert.equal(query(executableSql({ ...claim, envelopes: [...claim.envelopes, ...claim.envelopes] })), "0|0|0|0");
    query(`UPDATE invitation_grants SET fingerprints='[{"documentId":"${randomUUID()}","ownerWrappedKey":"owner-wrapper","profileId":"trustmark-q-lab-v2"}]' WHERE share_id='${shareId}'`);
    assert.equal(query(executableSql(claim)), "0|0|0|0");
    query(`UPDATE invitation_grants SET fingerprints='[{"documentId":"${documentId}","ownerWrappedKey":"owner-wrapper","profileId":"trustmark-q-lab-v2"}]' WHERE share_id='${shareId}'`);
    assert.equal(query(executableSql(claim)), "1|1|1|1");
    assert.equal(query(executableSql(claim)), "0|0|0|0");
    assert.equal(query(`SELECT status || '|' || recipient_clerk_user_id || '|' || recipient_name FROM shares WHERE id='${shareId}'`), "ACTIVE|alice-user|Alice");
    assert.equal(query(`SELECT count(*) FROM document_key_envelopes WHERE clerk_user_id='alice-user'`), "1");
    assert.equal(query(`SELECT count(*) FROM copy_fingerprints WHERE share_id='${shareId}'`), "1");
    assert.equal(query(`SELECT count(*) FROM invitation_grants WHERE share_id='${shareId}'`), "0");
    console.log("PASS: wrong identity/key/proof, expiry/revocation/deletion gates, atomic activation, encrypted records, and repeat rejection on disposable PostgreSQL.");
  } finally {
    spawnSync("docker", ["rm", "-f", container]);
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
