import type { DevIssuer } from "@mono/server-kit/dev";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
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

// Copies of the FE contract (spec "API" section; Task 8 defines the same shapes).
const feTask = z.object({
  id: z.string(),
  milestone_id: z.string(),
  title: z.string(),
  status: z.enum(["todo", "in_progress", "done"]),
  assignee_name: z.string().nullable(),
  due_date: z.string().nullable(),
  position: z.number(),
  is_internal: z.boolean(),
});
const feMilestone = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  position: z.number(),
  due_date: z.string().nullable(),
  status: z.enum(["pending", "in_progress", "awaiting_approval", "approved", "changes_requested"]),
  progress: z.number(),
  decided_by_name: z.string().nullable(),
  decided_at: z.string().nullable(),
  decision_note: z.string().nullable(),
  tasks: z.array(feTask),
});
const feListItem = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  status: z.enum(["planning", "in_progress", "on_hold", "completed", "cancelled"]),
  health: z.enum(["on_track", "at_risk", "off_track"]),
  start_date: z.string().nullable(),
  target_date: z.string().nullable(),
  progress: z.number(),
  is_overdue: z.boolean(),
  milestone_count: z.number(),
  milestone_done_count: z.number(),
  awaiting_approval_count: z.number(),
  updated_at: z.string(),
});
const feProject = feListItem.extend({
  description: z.string(),
  completed_at: z.string().nullable(),
  milestones: z.array(feMilestone),
});
const feList = z.object({ items: z.array(feListItem), total: z.number() });
const feSummary = z.object({
  total: z.number(),
  on_track: z.number(),
  at_risk: z.number(),
  off_track: z.number(),
  completed: z.number(),
  awaiting_approval: z.number(),
});

let issuer: DevIssuer;
let app: FastifyInstance;
let db: Db;
let pm: string;
let client: string;
let otherOrgPm: string;
let noOrg: string;

beforeAll(async () => {
  issuer = await startTestIssuer();
  pm = await tokenFor(issuer, ["project:all"]);
  client = await tokenFor(issuer, ["project:view", "project.milestone:approve"]);
  otherOrgPm = await tokenFor(issuer, ["project:all"], { orgId: ORG_B });
  noOrg = await tokenFor(issuer, ["project:all"], { orgId: null });
});
beforeEach(async () => {
  const test = await createTestDb();
  db = test.db;
  app = await buildApp({ env: testEnv(issuer.issuer()), db, closeDb: test.close });
});
afterEach(() => app.close());
afterAll(() => issuer.app.close());

const create = (token: string, payload: Record<string, unknown>) =>
  app.inject({ method: "POST", url: "/v1/projects", headers: bearer(token), payload });
const get = (token: string, url: string) => app.inject({ url, headers: bearer(token) });
const patch = (token: string, id: string, payload: Record<string, unknown>) =>
  app.inject({ method: "PATCH", url: `/v1/projects/${id}`, headers: bearer(token), payload });

async function makeProject(payload: Record<string, unknown> = {}): Promise<string> {
  const res = await create(pm, { code: "PRJ-1", name: "Website", ...payload });
  return res.json().data.id;
}

describe("projects routes", () => {
  it("creates a project with defaults in the FE's shape", async () => {
    const res = await create(pm, { code: "PRJ-1", name: "Website" });
    expect(res.statusCode).toBe(201);
    const data = feProject.parse(res.json().data);
    expect(data).toMatchObject({
      status: "planning",
      health: "on_track",
      progress: 0,
      milestones: [],
      is_overdue: false,
      completed_at: null,
    });
  });

  it("rejects a duplicate code with 409 and a target before the start with 422", async () => {
    await makeProject();
    const dup = await create(pm, { code: "PRJ-1", name: "Lain" });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().message).toBe("Kode project sudah dipakai");
    const bad = await create(pm, {
      code: "PRJ-2",
      name: "x",
      start_date: "2026-05-02",
      target_date: "2026-05-01",
    });
    expect(bad.statusCode).toBe(422);
    const id = await makeProject({ code: "PRJ-3", start_date: "2026-05-02" });
    expect((await patch(pm, id, { target_date: "2026-05-01" })).statusCode).toBe(422);
    const other = await makeProject({ code: "PRJ-4" });
    expect((await patch(pm, other, { code: "PRJ-1" })).statusCode).toBe(409);
  });

  it("forbids clients from managing and users without an org from anything", async () => {
    expect((await create(client, { code: "X", name: "x" })).statusCode).toBe(403);
    expect((await get(noOrg, "/v1/projects")).statusCode).toBe(403);
    expect((await app.inject({ url: "/v1/projects" })).statusCode).toBe(401);
  });

  it("isolates organisations: another org gets 404 and an empty list", async () => {
    const id = await makeProject();
    expect((await get(otherOrgPm, `/v1/projects/${id}`)).statusCode).toBe(404);
    expect((await patch(otherOrgPm, id, { name: "x" })).statusCode).toBe(404);
    const del = await app.inject({
      method: "DELETE",
      url: `/v1/projects/${id}`,
      headers: bearer(otherOrgPm),
    });
    expect(del.statusCode).toBe(404);
    expect(del.json().message).toBe("Data tidak ditemukan");
    expect((await get(otherOrgPm, "/v1/projects")).json().data.total).toBe(0);
    expect((await get(otherOrgPm, "/v1/projects/summary")).json().data.total).toBe(0);
    // The owner still sees it, untouched.
    expect((await get(pm, `/v1/projects/${id}`)).json().data.name).toBe("Website");
  });

  it("rejects a malformed id with 422", async () => {
    expect((await get(pm, "/v1/projects/not-a-uuid")).statusCode).toBe(422);
  });

  it("never leaks internal tasks into a client's progress, counts or lists", async () => {
    const id = await makeProject();
    const [m] = await db
      .insert(milestones)
      .values({ orgId: ORG_A, projectId: id, title: "M1", position: 0 })
      .returning();
    const base = { orgId: ORG_A, projectId: id, milestoneId: m?.id as string };
    await db.insert(tasks).values([
      { ...base, title: "Publik", status: "done", position: 0 },
      { ...base, title: "Rahasia", status: "todo", position: 1, isInternal: true },
    ]);

    const staff = feProject.parse((await get(pm, `/v1/projects/${id}`)).json().data);
    expect(staff.progress).toBe(50);
    expect(staff.milestones[0]?.progress).toBe(50);
    expect(staff.milestones[0]?.tasks).toHaveLength(2);

    const seen = feProject.parse((await get(client, `/v1/projects/${id}`)).json().data);
    expect(seen.progress).toBe(100);
    expect(seen.milestones[0]?.progress).toBe(100);
    expect(seen.milestones[0]?.tasks).toHaveLength(1);
    expect(JSON.stringify(seen)).not.toContain("Rahasia");

    expect(feList.parse((await get(pm, "/v1/projects")).json().data).items[0]?.progress).toBe(50);
    expect(feList.parse((await get(client, "/v1/projects")).json().data).items[0]?.progress).toBe(
      100
    );
  });

  it("sets completed_at on completion and clears it otherwise", async () => {
    const id = await makeProject();
    const done = (await patch(pm, id, { status: "completed" })).json().data;
    expect(new Date(done.completed_at).toISOString()).toBe(done.completed_at);
    const back = (await patch(pm, id, { status: "in_progress" })).json().data;
    expect(back.completed_at).toBeNull();
  });

  it("archives on DELETE: gone from list and detail", async () => {
    const id = await makeProject();
    const del = await app.inject({
      method: "DELETE",
      url: `/v1/projects/${id}`,
      headers: bearer(pm),
    });
    expect(del.statusCode).toBe(200);
    expect(del.json().data).toBeNull();
    expect((await get(pm, "/v1/projects")).json().data.total).toBe(0);
    expect((await get(pm, `/v1/projects/${id}`)).statusCode).toBe(404);
    expect((await get(pm, "/v1/projects/summary")).json().data.total).toBe(0);
  });

  it("searches by code or name, filters by health and status, and paginates", async () => {
    await makeProject({ code: "PRJ-1", name: "Website" });
    await makeProject({ code: "ABC-2", name: "Aplikasi", health: "at_risk" });
    const codes = async (q: string) =>
      feList.parse((await get(pm, `/v1/projects${q}`)).json().data).items.map((i) => i.code);
    expect(await codes("?search=prj")).toEqual(["PRJ-1"]);
    expect(await codes("?search=aplik")).toEqual(["ABC-2"]);
    expect(await codes("?health=at_risk")).toEqual(["ABC-2"]);
    expect(await codes("?status=completed")).toEqual([]);
    const page2 = (await get(pm, "/v1/projects?page=2&page_size=1")).json().data;
    expect(page2.items).toHaveLength(1);
    expect(page2.total).toBe(2);
    expect((await get(pm, "/v1/projects?page=0")).statusCode).toBe(422);
  });

  it("flags overdue projects against today (UTC)", async () => {
    const day = (offset: number) =>
      new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
    await makeProject({ code: "LATE", target_date: day(-1) });
    await makeProject({ code: "OK", target_date: day(0) });
    const items = feList.parse((await get(pm, "/v1/projects")).json().data).items;
    expect(Object.fromEntries(items.map((i) => [i.code, i.is_overdue]))).toEqual({
      LATE: true,
      OK: false,
    });
  });

  it("summarises projects, excluding completed ones from health counts", async () => {
    await makeProject({ code: "A", health: "on_track" });
    await makeProject({ code: "B", health: "at_risk" });
    await makeProject({ code: "C", health: "off_track", status: "completed" });
    const id = await makeProject({ code: "D" });
    await db.insert(milestones).values({
      orgId: ORG_A,
      projectId: id,
      title: "M",
      position: 0,
      status: "awaiting_approval",
    });
    const summary = feSummary.parse((await get(client, "/v1/projects/summary")).json().data);
    expect(summary).toEqual({
      total: 4,
      on_track: 2,
      at_risk: 1,
      off_track: 0,
      completed: 1,
      awaiting_approval: 1,
    });
    const item = feList.parse((await get(pm, "/v1/projects?search=D")).json().data).items[0];
    expect(item).toMatchObject({ milestone_count: 1, awaiting_approval_count: 1 });
  });
});
