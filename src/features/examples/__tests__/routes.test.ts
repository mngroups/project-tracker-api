import type { DevIssuer } from "@mono/server-kit/dev";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createTestDb } from "../../../__tests__/db.js";
import { bearer, startTestIssuer, testEnv, tokenFor } from "../../../__tests__/helpers.js";
import { buildApp } from "../../../app.js";

// Copies of the FE contract (monexa-app-template/features/example/schema.ts).
const feItem = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(["active", "inactive"]),
  created_at: z.string(),
});
const feList = z.object({ items: z.array(feItem), total: z.number() });

let issuer: DevIssuer;
let app: FastifyInstance;
let viewer: string;
let creator: string;

beforeAll(async () => {
  issuer = await startTestIssuer();
  viewer = await tokenFor(issuer, ["example.item:view"]);
  creator = await tokenFor(issuer, ["example:all"]);
});
beforeEach(async () => {
  const { db, close } = await createTestDb();
  app = await buildApp({ env: testEnv(issuer.issuer()), db, closeDb: close });
});
afterEach(() => app.close());
afterAll(() => issuer.app.close());

const create = (token: string, payload: Record<string, unknown>) =>
  app.inject({ method: "POST", url: "/v1/examples", headers: bearer(token), payload });
const list = (token: string, query = "") =>
  app.inject({ url: `/v1/examples${query}`, headers: bearer(token) });

describe("examples routes", () => {
  it("creates an item and lists it in the FE's shape", async () => {
    const created = await create(creator, { name: "  Contoh  ", note: "x" });
    expect(created.statusCode).toBe(201);
    expect(feItem.parse(created.json().data)).toMatchObject({ name: "Contoh", status: "active" });
    expect(new Date(created.json().data.created_at).toISOString()).toBe(
      created.json().data.created_at
    );

    const res = await list(viewer);
    expect(res.statusCode).toBe(200);
    const data = feList.parse(res.json().data);
    expect(data.total).toBe(1);
    expect(data.items[0]?.id).toBe(created.json().data.id);
  });

  it("filters by search", async () => {
    await create(creator, { name: "Alpha", note: "" });
    await create(creator, { name: "Beta", note: "" });
    const data = (await list(viewer, "?search=alp")).json().data;
    expect(data.items.map((i: { name: string }) => i.name)).toEqual(["Alpha"]);
    expect(data.total).toBe(1);
  });

  it("coerces and bounds pagination from the query string", async () => {
    for (const name of ["a", "b", "c"]) await create(creator, { name, note: "" });
    const page2 = (await list(viewer, "?page=2&page_size=2")).json().data;
    expect(page2.items).toHaveLength(1);
    expect(page2.total).toBe(3);
    expect((await list(viewer, "?page_size=101")).statusCode).toBe(422);
    expect((await list(viewer, "?page=0")).statusCode).toBe(422);
    expect((await list(viewer, "?page=abc")).statusCode).toBe(422);
  });

  it("defaults to page 1 with 20 items", async () => {
    for (let i = 0; i < 21; i += 1) await create(creator, { name: `n${i}`, note: "" });
    const data = (await list(viewer)).json().data;
    expect(data.items).toHaveLength(20);
    expect(data.total).toBe(21);
  });

  it("validates the create body", async () => {
    expect((await create(creator, { name: "   ", note: "" })).statusCode).toBe(422);
    expect((await create(creator, { name: "x".repeat(101), note: "" })).statusCode).toBe(422);
    expect((await create(creator, { name: "ok", note: "x".repeat(501) })).statusCode).toBe(422);
    expect((await create(creator, { name: "tanpa note" })).statusCode).toBe(201);
  });

  it("enforces permissions", async () => {
    const none = await tokenFor(issuer, []);
    expect((await list(none)).statusCode).toBe(403);
    expect((await create(viewer, { name: "x", note: "" })).statusCode).toBe(403);
    expect((await app.inject({ url: "/v1/examples" })).statusCode).toBe(401);
  });
});
