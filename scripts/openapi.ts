// `pnpm openapi`: regenerates openapi/openapi.json. A test fails when it is stale.
import { writeFileSync } from "node:fs";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/env.js";
import { generateOpenApi, OPENAPI_ENV } from "../src/openapi.js";

const app = await buildApp({
  env: loadEnv(OPENAPI_ENV),
  db: { execute: async () => undefined } as never,
});
const doc = await generateOpenApi(app);
await app.close();
writeFileSync(
  new URL("../openapi/openapi.json", import.meta.url),
  `${JSON.stringify(doc, null, 2)}\n`
);
console.log("openapi/openapi.json written");
