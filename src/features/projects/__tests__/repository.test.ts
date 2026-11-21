import { createTestDb } from "../../../__tests__/db.js";
import type { Db } from "../../../db/client.js";
import { projects } from "../../../db/schema/index.js";
import { createProjectsRepository, escapeLike } from "../repository.js";

const ORG_A = "00000000-0000-4000-8000-00000000000a";
const ORG_B = "00000000-0000-4000-8000-00000000000b";

let db: Db;
let close: () => Promise<void>;
beforeEach(async () => {
  ({ db, close } = await createTestDb());
});
afterEach(() => close());

const seed = (orgId: string, code: string, name = code, extra: object = {}) =>
  db
    .insert(projects)
    .values({ orgId, code, name, createdBy: "u", ...extra })
    .returning()
    .then((r) => r[0] as typeof projects.$inferSelect);

describe("projects repository", () => {
  it("findProject is org-scoped and skips archived rows", async () => {
    const repo = createProjectsRepository(db);
    const p = await seed(ORG_A, "A-1");
    const archived = await seed(ORG_A, "A-2", "x", { archivedAt: new Date() });
    expect((await repo.findProject(ORG_A, p.id))?.code).toBe("A-1");
    expect(await repo.findProject(ORG_B, p.id)).toBeNull();
    expect(await repo.findProject(ORG_A, archived.id)).toBeNull();
  });

  it("searches name or code, treating LIKE wildcards literally", async () => {
    const repo = createProjectsRepository(db);
    await seed(ORG_A, "PRJ-1", "Diskon 50%");
    await seed(ORG_A, "PRJ-2", "Diskon 500");
    const find = async (search: string) =>
      (
        await repo.list({ orgId: ORG_A, canSeeInternal: true }, { offset: 0, limit: 10, search })
      ).rows.map((r) => r.code);
    expect(await find("50%")).toEqual(["PRJ-1"]);
    expect(await find("prj-2")).toEqual(["PRJ-2"]);
  });

  it("touch bumps updated_at", async () => {
    const repo = createProjectsRepository(db);
    const p = await seed(ORG_A, "A-1", "x", { updatedAt: new Date(2020, 0, 1) });
    await repo.touch(ORG_A, p.id);
    expect((await repo.findProject(ORG_A, p.id))?.updatedAt.getFullYear()).toBeGreaterThan(2020);
  });
});

describe("escapeLike", () => {
  it("escapes LIKE wildcards and the escape character", () => {
    expect(escapeLike("50%_a\\b")).toBe("50\\%\\_a\\\\b");
  });
});
