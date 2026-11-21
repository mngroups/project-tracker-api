import type { DevIssuer } from "@mono/server-kit/dev";
import { buildApp } from "../app.js";
import { createDb } from "../db/client.js";
import { startTestIssuer, testEnv } from "./helpers.js";

let issuer: DevIssuer;
beforeAll(async () => {
  issuer = await startTestIssuer();
});
afterAll(() => issuer.app.close());

describe("buildApp with an unreachable database", () => {
  it("still boots: health is ok, readiness names the db", async () => {
    const { db, close } = createDb("postgres://u:p@127.0.0.1:1/x", 1);
    let closed = false;
    const app = await buildApp({
      env: testEnv(issuer.issuer()),
      db,
      closeDb: async () => {
        closed = true;
        await close();
      },
    });
    expect((await app.inject({ url: "/health" })).statusCode).toBe(200);
    const ready = await app.inject({ url: "/ready" });
    expect(ready.statusCode).toBe(503);
    expect(ready.json().data).toEqual({ checks: { db: "fail" } });
    await app.close();
    expect(closed).toBe(true);
  });
});
