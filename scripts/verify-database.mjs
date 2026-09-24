import nextEnv from "@next/env";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";

nextEnv.loadEnvConfig(process.cwd());

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("DATABASE_URL is empty. Paste the Neon pooled connection string into .env.local first.");
  process.exit(1);
}

const expectedTables = [
  "access_events",
  "document_key_envelopes",
  "documents",
  "share_batches",
  "shares",
  "upload_groups",
  "user_key_bundles",
];

try {
  const client = neon(databaseUrl);
  const database = drizzle({ client });
  await database.execute(sql`select 1`);

  const rows = await client`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
  `;
  const existingTables = new Set(rows.map((row) => row.table_name));
  const missingTables = expectedTables.filter((table) => !existingTables.has(table));

  if (missingTables.length) {
    console.error(`Neon is reachable, but migrations are missing: ${missingTables.join(", ")}`);
    console.error("Run npm run db:migrate, then run npm run db:verify again.");
    process.exit(1);
  }

  console.log("Neon and Drizzle are connected. All seven EchoLeaks tables are present.");
} catch {
  console.error("Neon connection failed. Check DATABASE_URL, network access, and the Neon project status.");
  process.exit(1);
}
