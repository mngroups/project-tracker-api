// Release step, never run at boot: `pnpm db:migrate` (dev) or `node dist/db/migrate.js` (Docker image).
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  await migrate(drizzle(pool), {
    migrationsFolder: new URL("./migrations", import.meta.url).pathname,
  });
  console.log("migrations applied");
} finally {
  await pool.end();
}
