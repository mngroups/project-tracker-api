import { readFileSync } from "node:fs";
import { buildApp } from "../app.js";
import { loadEnv } from "../env.js";
import { generateOpenApi, OPENAPI_ENV } from "../openapi.js";
import { okDb } from "./helpers.js";

type Spec = {
  info: { title: string; version: string };
  paths: Record<string, Record<string, unknown>>;
};

async function spec(): Promise<Spec> {
  const app = await buildApp({ env: loadEnv(OPENAPI_ENV), db: okDb as never });
  const doc = (await generateOpenApi(app)) as Spec;
  await app.close();
  return doc;
}

describe("OpenAPI", () => {
  it("documents the app's routes from their Zod schemas", async () => {
    const doc = await spec();
    expect(doc.info).toEqual({ title: "Project Tracker API", version: "0.1.0" });
    expect(doc.paths["/v1/attachments/presign"]?.post).toBeDefined();
    expect(doc.paths["/v1/auth/check"]?.get).toBeDefined();
    expect(doc.paths["/health"]?.get).toBeDefined();
  });

  it("matches the committed openapi/openapi.json (run `pnpm openapi` after changing routes)", async () => {
    const committed = JSON.parse(
      readFileSync(new URL("../../openapi/openapi.json", import.meta.url), "utf8")
    );
    expect(await spec(), "run pnpm openapi").toEqual(committed);
  });
});
