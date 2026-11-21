// Vercel Function entry. vercel.json rewrites every path here; the app is built
// once per instance and reused across invocations.
import type { IncomingMessage, ServerResponse } from "node:http";
import { buildApp } from "../src/app.js";
import { createDb } from "../src/db/client.js";
import { loadEnv } from "../src/env.js";

const ready = (async () => {
  const env = loadEnv();
  const { db, close } = createDb(env.DATABASE_URL, env.DB_POOL_MAX);
  const app = await buildApp({ env, db, closeDb: close });
  await app.ready();
  return app;
})();

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const app = await ready;
  app.server.emit("request", req, res);
}
