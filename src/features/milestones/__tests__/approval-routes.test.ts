import type { DevIssuer } from "@mono/server-kit/dev";
import type { FastifyInstance } from "fastify";
import { createTestDb } from "../../../__tests__/db.js";
import { bearer, startTestIssuer, testEnv, tokenFor } from "../../../__tests__/helpers.js";
import { buildApp } from "../../../app.js";

let issuer: DevIssuer;
let app: FastifyInstance;
let pm: string;
let member: string;
let client: string;

beforeAll(async () => {
  issuer = await startTestIssuer();
  pm = await tokenFor(issuer, ["project:all"]);
  member = await tokenFor(issuer, ["project:view", "project.task:update"]);
  client = await tokenFor(issuer, ["project:view", "project.milestone:approve"], {
    sub: "client-1",
    name: "Klien Satu",
  });
});
beforeEach(async () => {
  const test = await createTestDb();
  app = await buildApp({ env: testEnv(issuer.issuer()), db: test.db, closeDb: test.close });
});
afterEach(() => app.close());
afterAll(() => issuer.app.close());

const call = (token: string, method: "GET" | "POST", url: string, payload?: object) =>
  app.inject({ method, url, headers: bearer(token), payload });

async function setup(code = "P"): Promise<{ base: string; project: string }> {
  const project = (await call(pm, "POST", "/v1/projects", { code, name: code })).json().data.id;
  const mid = (await call(pm, "POST", `/v1/projects/${project}/milestones`, { title: "M" })).json()
    .data.id;
  return { project, base: `/v1/projects/${project}/milestones/${mid}` };
}

describe("milestone approval routes", () => {
  it("runs submit, approve and shows the count to the client", async () => {
    const { base, project } = await setup();
    const sub = await call(pm, "POST", `${base}/submit`, {});
    expect(sub.statusCode).toBe(200);
    expect(sub.json().data.status).toBe("awaiting_approval");

    const list = await call(client, "GET", "/v1/projects");
    expect(list.json().data.items[0].awaiting_approval_count).toBe(1);

    const ok = await call(client, "POST", `${base}/approve`, { note: "OK" });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().data).toMatchObject({
      status: "approved",
      decided_by_name: "Klien Satu",
      decision_note: "OK",
    });
    expect(ok.json().data.decided_at).toBeTruthy();
    const detail = (await call(pm, "GET", `/v1/projects/${project}`)).json().data;
    expect(detail.milestone_done_count).toBe(1);
  });

  it("rejects approving twice with 422", async () => {
    const { base } = await setup();
    await call(pm, "POST", `${base}/submit`, {});
    expect((await call(client, "POST", `${base}/approve`, {})).statusCode).toBe(200);
    const again = await call(client, "POST", `${base}/approve`, {});
    expect(again.statusCode).toBe(422);
    expect(again.json().message).toBe("Status milestone tidak memungkinkan aksi ini");
  });

  it("lets only one of two concurrent approvals win", async () => {
    const { base } = await setup();
    await call(pm, "POST", `${base}/submit`, {});
    const codes = (
      await Promise.all([
        call(client, "POST", `${base}/approve`, {}),
        call(client, "POST", `${base}/approve`, {}),
      ])
    )
      .map((r) => r.statusCode)
      .sort();
    expect(codes).toEqual([200, 422]);
  });

  it("requires a non-blank note to request changes, then the PM can resubmit", async () => {
    const { base } = await setup();
    await call(pm, "POST", `${base}/submit`, {});
    const blank = await call(client, "POST", `${base}/request-changes`, { note: "  " });
    expect(blank.statusCode).toBe(422);
    expect(blank.json().message).toBe("Catatan revisi wajib diisi");
    expect((await call(client, "POST", `${base}/request-changes`, {})).statusCode).toBe(422);

    const res = await call(client, "POST", `${base}/request-changes`, { note: "Revisi logo" });
    expect(res.json().data).toMatchObject({
      status: "changes_requested",
      decision_note: "Revisi logo",
    });
    const re = await call(pm, "POST", `${base}/submit`, {});
    expect(re.statusCode).toBe(200);
    expect(re.json().data).toMatchObject({
      status: "awaiting_approval",
      decided_by_name: null,
      decided_at: null,
      decision_note: null,
    });
  });

  it("enforces permissions: a member cannot approve, a client cannot submit", async () => {
    const { base } = await setup();
    expect((await call(client, "POST", `${base}/submit`, {})).statusCode).toBe(403);
    await call(pm, "POST", `${base}/submit`, {});
    expect((await call(member, "POST", `${base}/approve`, {})).statusCode).toBe(403);
    expect((await call(member, "POST", `${base}/request-changes`, { note: "x" })).statusCode).toBe(
      403
    );
  });

  it("returns 404 for a milestone of another project and 422 for an over-long note", async () => {
    const { base } = await setup();
    const other = await setup("Q");
    const mid = base.split("/").pop();
    const res = await call(
      pm,
      "POST",
      `${other.base.split("/milestones")[0]}/milestones/${mid}/submit`,
      {}
    );
    expect(res.statusCode).toBe(404);
    await call(pm, "POST", `${base}/submit`, {});
    expect(
      (await call(client, "POST", `${base}/approve`, { note: "x".repeat(1001) })).statusCode
    ).toBe(422);
  });
});
