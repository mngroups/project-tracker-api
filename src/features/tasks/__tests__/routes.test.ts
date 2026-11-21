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
import { tasks } from "../../../db/schema/index.js";

let issuer: DevIssuer;
let app: FastifyInstance;
let db: Db;
let pm: string;
let member: string;
let client: string;
let viewerTask: string;
let otherOrgPm: string;

beforeAll(async () => {
  issuer = await startTestIssuer();
  pm = await tokenFor(issuer, ["project:all"]);
  member = await tokenFor(issuer, ["project:view", "project.internal:view", "project.task:update"]);
  client = await tokenFor(issuer, ["project:view", "project.milestone:approve"]);
  viewerTask = await tokenFor(issuer, ["project:view", "project.task:update"]);
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
  method: "GET" | "POST" | "PATCH" | "DELETE",
  url: string,
  payload?: Record<string, unknown>
) => app.inject({ method, url, headers: bearer(token), payload });

async function makeProject(code = "PRJ-1"): Promise<string> {
  return (await call(pm, "POST", "/v1/projects", { code, name: code })).json().data.id;
}
async function makeMilestone(p: string): Promise<string> {
  return (await call(pm, "POST", `/v1/projects/${p}/milestones`, { title: "M" })).json().data.id;
}
async function makeTask(
  p: string,
  m: string,
  extra: Record<string, unknown> = {}
): Promise<string> {
  const res = await call(pm, "POST", `/v1/projects/${p}/milestones/${m}/tasks`, {
    title: "T",
    ...extra,
  });
  expect(res.statusCode).toBe(201);
  return res.json().data.id;
}

describe("tasks routes", () => {
  it("appends tasks and updates their fields", async () => {
    const p = await makeProject();
    const m = await makeMilestone(p);
    const t1 = await makeTask(p, m);
    const res2 = await call(pm, "POST", `/v1/projects/${p}/milestones/${m}/tasks`, {
      title: "T2",
      assignee_name: "Budi",
      due_date: "2026-06-01",
      is_internal: true,
    });
    expect(res2.json().data).toMatchObject({
      position: 1,
      assignee_name: "Budi",
      is_internal: true,
      status: "todo",
    });
    const patched = await call(pm, "PATCH", `/v1/projects/${p}/tasks/${t1}`, {
      title: "Baru",
      status: "in_progress",
    });
    expect(patched.json().data).toMatchObject({
      title: "Baru",
      status: "in_progress",
      milestone_id: m,
    });
  });

  it("lets a member change status and updates progress; a client gets 403", async () => {
    const p = await makeProject();
    const m = await makeMilestone(p);
    const t = await makeTask(p, m);
    const res = await call(member, "PATCH", `/v1/projects/${p}/tasks/${t}/status`, {
      status: "done",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("done");
    expect((await call(pm, "GET", `/v1/projects/${p}`)).json().data.progress).toBe(100);
    const denied = await call(client, "PATCH", `/v1/projects/${p}/tasks/${t}/status`, {
      status: "done",
    });
    expect(denied.statusCode).toBe(403);
    const mgr = await call(member, "PATCH", `/v1/projects/${p}/tasks/${t}`, { title: "x" });
    expect(mgr.statusCode).toBe(403);
  });

  it("hides internal tasks from callers without project.internal:view, even on status change", async () => {
    const p = await makeProject();
    const m = await makeMilestone(p);
    const t = await makeTask(p, m, { is_internal: true });
    const res = await call(viewerTask, "PATCH", `/v1/projects/${p}/tasks/${t}/status`, {
      status: "done",
    });
    expect(res.statusCode).toBe(404);
    expect((await db.select().from(tasks))[0]?.status).toBe("todo");
    expect(
      (await call(member, "PATCH", `/v1/projects/${p}/tasks/${t}/status`, { status: "done" }))
        .statusCode
    ).toBe(200);
  });

  it("returns 404 across organisations and projects, including moves", async () => {
    const a = await makeProject("A");
    const b = await makeProject("B");
    const ma = await makeMilestone(a);
    const mb = await makeMilestone(b);
    const ta = await makeTask(a, ma);
    const tb = await makeTask(b, mb);

    expect(
      (await call(pm, "PATCH", `/v1/projects/${a}/tasks/${tb}`, { title: "x" })).statusCode
    ).toBe(404);
    expect((await call(pm, "DELETE", `/v1/projects/${a}/tasks/${tb}`)).statusCode).toBe(404);
    expect(
      (await call(pm, "POST", `/v1/projects/${a}/milestones/${mb}/tasks`, { title: "x" }))
        .statusCode
    ).toBe(404);
    expect(
      (await call(otherOrgPm, "PATCH", `/v1/projects/${a}/tasks/${ta}/status`, { status: "done" }))
        .statusCode
    ).toBe(404);
    expect(
      (await call(otherOrgPm, "PATCH", `/v1/projects/${a}/tasks/${ta}`, { title: "x" })).statusCode
    ).toBe(404);
    expect((await call(otherOrgPm, "DELETE", `/v1/projects/${a}/tasks/${ta}`)).statusCode).toBe(
      404
    );
    const move = await call(pm, "PATCH", `/v1/projects/${a}/tasks/${ta}`, { milestone_id: mb });
    expect(move.statusCode).toBe(404);
    expect(move.json().message).toBe("Data tidak ditemukan");
    const ok = await makeMilestone(a);
    expect(
      (await call(pm, "PATCH", `/v1/projects/${a}/tasks/${ta}`, { milestone_id: ok })).json().data
        .milestone_id
    ).toBe(ok);
  });

  it("deletes a task", async () => {
    const p = await makeProject();
    const t = await makeTask(p, await makeMilestone(p));
    expect((await call(pm, "DELETE", `/v1/projects/${p}/tasks/${t}`)).statusCode).toBe(200);
    expect(await db.select().from(tasks)).toHaveLength(0);
  });

  it("keeps ORG_A's data when creating with an unknown project", async () => {
    const res = await call(pm, "POST", `/v1/projects/${ORG_A}/milestones/${ORG_A}/tasks`, {
      title: "x",
    });
    expect(res.statusCode).toBe(404);
  });
});
