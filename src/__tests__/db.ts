import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Db } from "../db/client.js";
import * as schema from "../db/schema/index.js";

/** An in-process Postgres (PGlite) with the real migrations applied. */
export async function createTestDb(): Promise<{ db: Db; close(): Promise<void> }> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: new URL("../db/migrations", import.meta.url).pathname });
  return { db: db as unknown as Db, close: () => client.close() };
}
