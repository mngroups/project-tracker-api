// Docker entry: `node dist/server.js`. Migrations are a separate release step
// (`node dist/db/migrate.js`), never run here.
import { startServer } from "@mono/server-kit";
import { buildApp } from "./app.js";
import { createDb } from "./db/client.js";
import { loadEnv } from "./env.js";

const env = loadEnv();
const { db, close } = createDb(env.DATABASE_URL, env.DB_POOL_MAX);
const app = await buildApp({ env, db, closeDb: close });
await startServer(app, { port: env.PORT });
