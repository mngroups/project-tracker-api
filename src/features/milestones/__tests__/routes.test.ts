import type { DevIssuer } from "@mono/server-kit/dev";
import type { FastifyInstance } from "fastify";
import { createTestDb } from "../../../__tests__/db.js";
import {
  bearer,
  ORG_A,
  ORG_B,
  startTestIssuer,
  testEnv,
  tokenFor,
} from "../../../__tests__/helpers.js";
import { buildApp } from "../../../app.js";
import type { Db } from "../../../db/client.js";
import { milestones, tasks } from "../../../db/schema/index.js";

let issuer: DevIssuer;
let app: FastifyInstance;
let db: Db;
let pm: string;
let client: string;
let otherOrgPm: string;

beforeAll(async () => {
  issuer = await startTestIssuer();
  pm = await tokenFor(issuer, ["project:all"]);
  client = await tokenFor(issuer, ["project:view", "project.milestone:approve"]);
  otherOrgPm = await tokenFor(issuer, ["project:all"], { orgId: ORG_B });
});
beforeEach(async () => {
  const test = await createTestDb();
  db = test.db;
  app = await buildApp({ env: testEnv(issuer.issuer()), db, closeDb: test.close });
});
afterEach(() => app.close());
afterAll(() => issuer.app.close());

const call = (
  token: string,
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  url: string,
  payload?: Record<string, unknown>
) => app.inject({ method, url, headers: bearer(token), payload });

async function makeProject(code = "PRJ-1"): Promise<string> {
  return (await call(pm, "POST", "/v1/projects", { code, name: code })).json().data.id;
}
async function makeMilestone(projectId: string, title = "M"): Promise<string> {
  const res = await call(pm, "POST", `/v1/projects/${projectId}/milestones`, { title });
  expect(res.statusCode).toBe(201);
  return res.json().data.id;
}

describe("milestones routes", () => {
  it("appends milestones at positions 0, 1, 2 and reorders them in one go", async () => {
    const p = await makeProject();
    const ids = [
      await makeMilestone(p, "A"),
      await makeMilestone(p, "B"),
      await makeMilestone(p, "C"),
    ];
    const detail = (await call(pm, "GET", `/v1/projects/${p}`)).json().data;
    expect(detail.milestones.map((m: { position: number }) => m.position)).toEqual([0, 1, 2]);

    const reversed = [...ids].reverse();
    expect(
      (await call(pm, "PUT", `/v1/projects/${p}/milestones/order`, { ids: reversed })).statusCode
    ).toBe(200);
    const after = (await call(pm, "GET", `/v1/projects/${p}`)).json().data;
    expect(after.milestones.map((m: { id: string }) => m.id)).toEqual(reversed);

    const missing = await call(pm, "PUT", `/v1/projects/${p}/milestones/order`, {
      ids: ids.slice(1),
    });
    expect(missing.statusCode).toBe(422);
    expect(missing.json().message).toBe("Urutan milestone tidak valid");
    const extra = await call(pm, "PUT", `/v1/projects/${p}/milestones/order`, {
      ids: [...ids, "00000000-0000-4000-8000-000000000001"],
    });
    expect(extra.statusCode).toBe(422);
    const dup = await call(pm, "PUT", `/v1/projects/${p}/milestones/order`, {
      ids: [ids[0], ids[0], ids[1]],
    });
    expect(dup.statusCode).toBe(422);
  });

  it("returns the created and patched milestone and restricts status to pending/in_progress", async () => {
    const p = await makeProject();
    const m = await makeMilestone(p);
    const res = await call(pm, "PATCH", `/v1/projects/${p}/milestones/${m}`, {
      title: "Baru",
      status: "in_progress",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ title: "Baru", status: "in_progress", tasks: [] });
    const bad = await call(pm, "PATCH", `/v1/projects/${p}/milestones/${m}`, {
      status: "approved",
    });
    expect(bad.statusCode).toBe(422);
  });

  it("forbids clients from managing milestones", async () => {
    const p = await makeProject();
    expect(
      (await call(client, "POST", `/v1/projects/${p}/milestones`, { title: "x" })).statusCode
    ).toBe(403);
  });

  it("blocks edits on an awaiting_approval milestone and deletes of an approved one", async () => {
    const p = await makeProject();
    const m = await makeMilestone(p);
    const m2 = await makeMilestone(p);
    await db.update(milestones).set({ status: "awaiting_approval" }).where(eqId(m));
    const edit = await call(pm, "PATCH", `/v1/projects/${p}/milestones/${m}`, { title: "x" });
    expect(edit.statusCode).toBe(422);
    expect(edit.json().message).toBe("Status milestone tidak memungkinkan aksi ini");

    await db.update(milestones).set({ status: "approved" }).where(eqId(m2));
    const del = await call(pm, "DELETE", `/v1/projects/${p}/milestones/${m2}`);
    expect(del.statusCode).toBe(422);
  });

  it("deletes a milestone together with its tasks", async () => {
    const p = await makeProject();
    const m = await makeMilestone(p);
    await db
      .insert(tasks)
      .values({ orgId: ORG_A, projectId: p, milestoneId: m, title: "T", position: 0 });
    const del = await call(pm, "DELETE", `/v1/projects/${p}/milestones/${m}`);
    expect(del.statusCode).toBe(200);
    expect(await db.select().from(tasks)).toHaveLength(0);
    expect((await call(pm, "DELETE", `/v1/projects/${p}/milestones/${m}`)).statusCode).toBe(404);
  });

  it("returns 404 across projects and organisations", async () => {
    const a = await makeProject("A");
    const b = await makeProject("B");
    const mb = await makeMilestone(b);
    const viaA = `/v1/projects/${a}/milestones/${mb}`;
    expect((await call(pm, "PATCH", viaA, { title: "x" })).statusCode).toBe(404);
    expect((await call(pm, "DELETE", viaA)).statusCode).toBe(404);
    const other = await call(otherOrgPm, "POST", `/v1/projects/${a}/milestones`, { title: "x" });
    expect(other.statusCode).toBe(404);
    expect(
      (await call(otherOrgPm, "PATCH", `/v1/projects/${b}/milestones/${mb}`, { title: "x" }))
        .statusCode
    ).toBe(404);
    expect(
      (await call(pm, "PATCH", `/v1/projects/${a}/milestones/not-a-uuid`, { title: "x" }))
        .statusCode
    ).toBe(422);
  });
});

import { eq } from "drizzle-orm";

function eqId(id: string) {
  return eq(milestones.id, id);
}
