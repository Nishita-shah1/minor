import "server-only";

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { getDatabaseEnv } from "@/lib/server/env";
import * as schema from "./schema";

let database: ReturnType<typeof createDatabase> | undefined;

function createDatabase() {
  const sql = neon(getDatabaseEnv().DATABASE_URL);
  return drizzle({ client: sql, schema });
}

export function getDb() {
  database ??= createDatabase();
  return database;
}
