// Real disposable PostgreSQL only. Never reads DATABASE_URL or sends email.
import { spawnSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import { appendRecipientsSql } from "../lib/shares/persist";

async function main() {
  const container = `echoleaks-share-check-${randomUUID()}`;
  const group = randomUUID(), batch = randomUUID(), document = randomUUID();
  const command = (args: string[], input?: string) => {
    const r = spawnSync("docker", args, { input, encoding: "utf8" });
    if (r.status !== 0) throw new Error(r.stderr || r.stdout);
    return r.stdout.trim();
  };
  const query = (text: string) => command(["exec", "-i", container, "psql", "-U", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], text);
  const recipient = (email: string, userId = email) => ({ id: randomUUID(), email, userId, status: "ACTIVE", keyVersion: 1, envelopes: [{ documentId: document, wrappedFileKey: "public-test-wrapper", fingerprint: {ownerWrappedKey:"owner-test-wrapper",recipientWrappedKey:"recipient-test-wrapper",profileId:"trustmark-q-lab-v2"} }] });
  const append = (rows: ReturnType<typeof recipient>[], owner = "owner") => {
    const q = new PgDialect().sqlToQuery(appendRecipientsSql(group, owner, rows, true));
    return q.sql.replace(/\$(\d+)/g, (_, n) => `'${String(q.params[Number(n) - 1]).replaceAll("'", "''")}'`);
  };
  const transaction = (text: string) => `BEGIN; SELECT id FROM upload_groups WHERE id='${group}' FOR UPDATE; ${text}; COMMIT;`;
  try {
    command(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=disposable-local-check", "postgres:17.5"]);
    for (let i = 0; i < 60; i++) {
      const r = spawnSync("docker", ["exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]);
      if (r.status === 0) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    for (const file of readdirSync("drizzle").filter(file => file.endsWith(".sql")).sort()) query(readFileSync(`drizzle/${file}`, "utf8"));
    query(`INSERT INTO upload_groups(id,owner_clerk_user_id,status,expected_file_count) VALUES('${group}','owner','READY',1);
      INSERT INTO documents(id,group_id,owner_clerk_user_id,status) VALUES('${document}','${group}','owner','READY');
      INSERT INTO share_batches(id,group_id,sender_clerk_user_id,permission) VALUES('${batch}','${group}','owner','VIEW_ONLY');`);
    const alice = recipient("alice@example.test");
    query(transaction(append([alice])));
    query(`DELETE FROM copy_fingerprints WHERE share_id='${alice.id}'`);
    query(transaction(append([recipient(alice.email)])));
    assert.equal(query("SELECT count(*) FROM copy_fingerprints"), "1");
    assert.equal(query("SELECT count(*) FROM shares"), "1");
    assert.equal(query("SELECT id FROM shares"), alice.id);
    query(transaction(append([recipient("bob@example.test")])));
    assert.equal(query("SELECT count(*) FROM shares"), "2");
    assert.equal(query("SELECT count(*) FROM document_key_envelopes"), "2");
    query(transaction(append([recipient("alias@example.test", alice.userId)])));
    assert.equal(query("SELECT count(*) FROM shares"), "2");
    query(`UPDATE shares SET status='REVOKED' WHERE id='${alice.id}'`);
    query(transaction(append([recipient(alice.email)])));
    assert.equal(query(`SELECT status FROM shares WHERE id='${alice.id}'`), "REVOKED");
    query(transaction(append([recipient("intruder@example.test")], "intruder")));
    assert.equal(query("SELECT count(*) FROM shares"), "2");
    query("UPDATE share_batches SET email_status='SENDING'");
    query(transaction(append([recipient("blocked@example.test")])));
    assert.equal(query("SELECT count(*) FROM shares"), "2");
    query("UPDATE share_batches SET email_status='NOT_REQUESTED'");
    query(transaction(append(Array.from({length:97},(_,i)=>recipient(`user-${i}@example.test`)))));
    const concurrent = (text: string) => new Promise<void>((resolve, reject) => {
      const child = spawn("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-At", "-v", "ON_ERROR_STOP=1"]);
      let error = ""; child.stderr.on("data", data => error += data); child.stdout.resume();
      child.on("close", code => code === 0 ? resolve() : reject(new Error(error)));
      child.stdin.end(transaction(`SELECT pg_sleep(0.2); ${text}`));
    });
    await Promise.all([concurrent(append([recipient("last-a@example.test")])), concurrent(append([recipient("last-b@example.test")]))]);
    assert.equal(query("SELECT count(*) FROM shares"), "100");
    assert.equal(query("SELECT count(*) FROM document_key_envelopes"), "100");
    assert.equal(query("SELECT count(*) FROM share_batches"), "1");
    assert.equal(query("SELECT count(*) FROM copy_fingerprints"), "100");
    assert.equal(query("SELECT count(DISTINCT profile_id) FROM copy_fingerprints"), "1");
    query("UPDATE upload_groups SET status='DELETING'");
    query(transaction(append([recipient("deleted@example.test")])));
    assert.equal(query("SELECT count(*) FROM shares"), "100");
    console.log("PASS: append, stable retry, account deduplication, revocation preservation, owner isolation, email exclusion, concurrent 100-recipient cap, envelopes, one batch, deletion blocking.");
  } finally { spawnSync("docker", ["rm", "-f", container]); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
