import type { DevIssuer } from "@mono/server-kit/dev";
import type { FastifyInstance } from "fastify";
import { createTestDb } from "../../../__tests__/db.js";
import { bearer, ORG_B, startTestIssuer, testEnv, tokenFor } from "../../../__tests__/helpers.js";
import { buildApp, type Presigner } from "../../../app.js";

const KNOWN = new Set(["uploads/u1/a.pdf", "uploads/u1/b.pdf", "uploads/u3/c.pdf"]);
const downloads: { key: string; filename: string }[] = [];
const presigner = {
  stat: async (key: string) =>
    KNOWN.has(key) ? { size: 1234, contentType: "application/pdf" } : null,
  presignDownload: async (p: { key: string; filename: string }) => {
    downloads.push(p);
    return { url: `https://s3.test/${p.key}`, expires_in: 300 };
  },
} as unknown as Presigner;

let issuer: DevIssuer;
let app: FastifyInstance;
let pm: string;
let client: string;
let client2: string;
let otherOrg: string;

beforeAll(async () => {
  issuer = await startTestIssuer();
  pm = await tokenFor(issuer, ["project:all"], { sub: "pm-1", name: "Rina PM" });
  client = await tokenFor(issuer, ["project:view", "project.attachment:upload"], {
    sub: "c-1",
    name: "Klien Satu",
  });
  client2 = await tokenFor(issuer, ["project:view", "project.attachment:upload"], { sub: "c-2" });
  otherOrg = await tokenFor(issuer, ["project:all"], { orgId: ORG_B });
});
beforeEach(async () => {
  downloads.length = 0;
  const test = await createTestDb();
  app = await buildApp({
    env: testEnv(issuer.issuer()),
    db: test.db,
    closeDb: test.close,
    presigner,
  });
});
afterEach(() => app.close());
afterAll(() => issuer.app.close());

const call = (
  token: string,
  method: "GET" | "POST" | "DELETE",
  url: string,
  payload?: Record<string, unknown>
) => app.inject({ method, url, headers: bearer(token), payload });

async function makeProject(code = "PRJ-1"): Promise<string> {
  return (await call(pm, "POST", "/v1/projects", { code, name: code })).json().data.id;
}
const commit = (token: string, p: string, extra: Record<string, unknown> = {}) =>
  call(token, "POST", `/v1/projects/${p}/attachments`, {
    upload_uuid: "u1",
    s3_key: "uploads/u1/a.pdf",
    file_name: "a.pdf",
    ...extra,
  });

describe("attachments commit", () => {
  it("commits a stored object with size and type from storage", async () => {
    const p = await makeProject();
    const res = await commit(client, p);
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({
      file_name: "a.pdf",
      content_type: "application/pdf",
      size: 1234,
      uploaded_by_name: "Klien Satu",
      is_internal: false,
      milestone_id: null,
      can_delete: true,
    });
  });

  it("rejects forged keys and unknown objects", async () => {
    const p = await makeProject();
    const mismatch = await commit(client, p, { s3_key: "uploads/u2/a.pdf" });
    expect(mismatch.statusCode).toBe(422);
    expect(mismatch.json().message).toBe("File tidak valid");
    const unknown = await commit(client, p, { s3_key: "uploads/u1/missing.pdf" });
    expect(unknown.statusCode).toBe(422);
  });

  it("forbids is_internal without internal permission", async () => {
    const p = await makeProject();
    expect((await commit(client, p, { is_internal: true })).statusCode).toBe(403);
    expect((await commit(pm, p, { is_internal: true })).statusCode).toBe(201);
  });

  it("rejects committing the same key twice", async () => {
    const p = await makeProject();
    expect((await commit(client, p)).statusCode).toBe(201);
    const again = await commit(client, p);
    expect(again.statusCode).toBe(409);
    expect(again.json().message).toBe("File sudah tersimpan");
  });

  it("404s for a milestone of another project, missing project or other org", async () => {
    const p = await makeProject();
    const other = await makeProject("PRJ-2");
    const m = (await call(pm, "POST", `/v1/projects/${other}/milestones`, { title: "M" })).json()
      .data.id;
    expect((await commit(client, p, { milestone_id: m })).statusCode).toBe(404);
    expect((await commit(otherOrg, p)).statusCode).toBe(404);
    expect((await commit(client, "00000000-0000-4000-8000-000000000001")).statusCode).toBe(404);
    expect((await commit(client, "nope")).statusCode).toBe(422);
  });

  it("requires the upload permission", async () => {
    const p = await makeProject();
    const viewer = await tokenFor(issuer, ["project:view"]);
    expect((await commit(viewer, p)).statusCode).toBe(403);
  });
});

describe("attachments list, download, delete", () => {
  it("lists newest first, hides internal files from clients, filters by milestone", async () => {
    const p = await makeProject();
    const m = (await call(pm, "POST", `/v1/projects/${p}/milestones`, { title: "M" })).json().data
      .id;
    await commit(client, p, { milestone_id: m });
    await commit(pm, p, {
      upload_uuid: "u1",
      s3_key: "uploads/u1/b.pdf",
      file_name: "b.pdf",
      is_internal: true,
    });
    await commit(client, p, { upload_uuid: "u3", s3_key: "uploads/u3/c.pdf", file_name: "c.pdf" });

    const asPm = (await call(pm, "GET", `/v1/projects/${p}/attachments`)).json().data;
    expect(asPm.map((a: { file_name: string }) => a.file_name)).toEqual([
      "c.pdf",
      "b.pdf",
      "a.pdf",
    ]);
    const asClient = (await call(client, "GET", `/v1/projects/${p}/attachments`)).json().data;
    expect(asClient.map((a: { file_name: string }) => a.file_name)).toEqual(["c.pdf", "a.pdf"]);
    expect(asClient[0].can_delete).toBe(true);
    const byMilestone = (
      await call(pm, "GET", `/v1/projects/${p}/attachments?milestone_id=${m}`)
    ).json().data;
    expect(byMilestone).toHaveLength(1);
    expect(byMilestone[0].can_delete).toBe(true);
    const c2 = (await call(client2, "GET", `/v1/projects/${p}/attachments`)).json().data;
    expect(c2[0].can_delete).toBe(false);
  });

  it("downloads through a presigned URL", async () => {
    const p = await makeProject();
    const id = (await commit(client, p)).json().data.id;
    const res = await call(client, "GET", `/v1/projects/${p}/attachments/${id}/download`);
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ url: "https://s3.test/uploads/u1/a.pdf", expires_in: 300 });
    expect(downloads).toEqual([
      { key: "uploads/u1/a.pdf", filename: "a.pdf", expiresInSeconds: 300 },
    ]);
  });

  it("hides internal files from clients and other orgs on download", async () => {
    const p = await makeProject();
    const id = (await commit(pm, p, { is_internal: true })).json().data.id;
    const url = `/v1/projects/${p}/attachments/${id}/download`;
    expect((await call(client, "GET", url)).statusCode).toBe(404);
    expect((await call(otherOrg, "GET", url)).statusCode).toBe(404);
    expect((await call(pm, "GET", url)).statusCode).toBe(200);
  });

  it("lets the uploader or a manager delete, nobody else", async () => {
    const p = await makeProject();
    const id = (await commit(client, p)).json().data.id;
    const url = `/v1/projects/${p}/attachments/${id}`;
    const denied = await call(client2, "DELETE", url);
    expect(denied.statusCode).toBe(403);
    expect((await call(otherOrg, "DELETE", url)).statusCode).toBe(404);
    expect((await call(client, "DELETE", url)).statusCode).toBe(200);
    expect((await call(client, "DELETE", url)).statusCode).toBe(404);

    const id2 = (await commit(client, p)).json().data.id;
    expect((await call(pm, "DELETE", `/v1/projects/${p}/attachments/${id2}`)).statusCode).toBe(200);
  });
});
