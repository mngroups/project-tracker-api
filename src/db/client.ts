import { drizzle } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import pg from "pg";
import * as schema from "./schema/index.js";

/** Any Drizzle Postgres database with this app's schema: node-postgres in prod, PGlite in tests. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export type CreateDbOptions = {
  /** Give up on a new connection after this long, so requests fail fast instead of hanging. Default 5s. */
  connectTimeoutMs?: number;
  /** Close connections idle for this long. Default 30s. */
  idleTimeoutMs?: number;
  /** An idle client's connection dropped (DB restart, failover, pooler recycling). Default: console.warn. */
  onIdleError?: (err: Error) => void;
};

/**
 * A node-postgres pool (connects lazily, so boot never waits on the database).
 * On Vercel point `url` at a pooler and keep `poolMax` at 1–3.
 */
export function createDb(
  url: string,
  poolMax: number,
  opts: CreateDbOptions = {}
): { db: Db; pool: pg.Pool; close(): Promise<void> } {
  const pool = new pg.Pool({
    connectionString: url,
    max: poolMax,
    connectionTimeoutMillis: opts.connectTimeoutMs ?? 5000,
    idleTimeoutMillis: opts.idleTimeoutMs ?? 30_000,
  });
  // Without a listener, node-postgres turns an idle client's error into an uncaught
  // exception and the process dies; the pool replaces the client on the next query.
  pool.on(
    "error",
    opts.onIdleError ?? ((err) => console.warn("idle postgres client error:", err.message))
  );
  return { db: drizzle(pool, { schema }) as unknown as Db, pool, close: () => pool.end() };
}
