import { sql } from "drizzle-orm";
import { createTestDb } from "../../__tests__/db.js";
import { createDb } from "../client.js";
import { attachments, milestones, projects, tasks } from "../schema/index.js";

describe("schema + migrations", () => {
  const ORG_A = "00000000-0000-4000-8000-00000000000a";
  const ORG_B = "00000000-0000-4000-8000-00000000000b";
  const project = (orgId: string, code: string) => ({
    orgId,
    code,
    name: "Website",
    createdBy: "user-1",
  });

  it("creates the four tables with defaults", async () => {
    const { db, close } = await createTestDb();
    const [p] = await db.insert(projects).values(project(ORG_A, "PRJ-1")).returning();
    expect(p).toMatchObject({ status: "planning", health: "on_track", description: "" });
    const [m] = await db
      .insert(milestones)
      .values({ orgId: ORG_A, projectId: p?.id as string, title: "M1", position: 0 })
      .returning();
    expect(m?.status).toBe("pending");
    const [t] = await db
      .insert(tasks)
      .values({
        orgId: ORG_A,
        projectId: p?.id as string,
        milestoneId: m?.id as string,
        title: "T",
        position: 0,
      })
      .returning();
    expect(t).toMatchObject({ status: "todo", isInternal: false });
    const [a] = await db
      .insert(attachments)
      .values({
        orgId: ORG_A,
        projectId: p?.id as string,
        milestoneId: m?.id as string,
        fileName: "a.pdf",
        contentType: "application/pdf",
        size: 1,
        s3Key: "uploads/x/a.pdf",
        uploadedBy: "user-1",
        uploadedByName: "PM",
      })
      .returning();
    expect(a?.isInternal).toBe(false);
    // milestone delete: attachment survives with a null milestone; tasks cascade.
    await db.delete(milestones);
    expect(await db.select().from(tasks)).toHaveLength(0);
    expect((await db.select().from(attachments))[0]?.milestoneId).toBeNull();
    await db.delete(projects);
    expect(await db.select().from(attachments)).toHaveLength(0);
    await close();
  });

  it("makes (org_id, code) unique but allows the same code in another org", async () => {
    const { db, close } = await createTestDb();
    await db.insert(projects).values(project(ORG_A, "PRJ-1"));
    await expect(db.insert(projects).values(project(ORG_A, "PRJ-1"))).rejects.toThrow();
    await expect(db.insert(projects).values(project(ORG_B, "PRJ-1"))).resolves.toBeDefined();
    await close();
  });

  it("rejects values outside the status enums", async () => {
    const { db, close } = await createTestDb();
    await expect(
      db.insert(projects).values({ ...project(ORG_A, "X"), status: "archived" as "planning" })
    ).rejects.toThrow();
    await close();
  });
});

describe("createDb", () => {
  it("does not connect until queried, and fails when the database is unreachable", async () => {
    const { db, close } = createDb("postgres://u:p@127.0.0.1:1/x", 2);
    await expect(db.execute(sql`select 1`)).rejects.toThrow();
    await close();
  });

  it("survives an idle-client error instead of crashing the process", async () => {
    const seen: Error[] = [];
    const { pool, close } = createDb("postgres://u:p@127.0.0.1:1/x", 1, {
      onIdleError: (err) => seen.push(err),
    });
    const err = new Error("terminating connection due to administrator command");
    expect(() => pool.emit("error", err)).not.toThrow();
    expect(seen).toEqual([err]);
    await close();
  });

  it("logs idle-client errors by default", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { pool, close } = createDb("postgres://u:p@127.0.0.1:1/x", 1);
    pool.emit("error", new Error("boom"));
    expect(warn).toHaveBeenCalledWith("idle postgres client error:", "boom");
    warn.mockRestore();
    await close();
  });

  it("gives up connecting after the connect timeout instead of hanging", async () => {
    // 10.255.255.1 is unroutable: without a timeout the connect waits for the OS (minutes).
    const { db, close } = createDb("postgres://u:p@10.255.255.1:5432/x", 1, {
      connectTimeoutMs: 200,
    });
    const started = Date.now();
    await expect(db.execute(sql`select 1`)).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(3000);
    await close();
  });
});
