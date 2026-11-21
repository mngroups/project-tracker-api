import { createTestDb } from "../../../__tests__/db.js";
import type { Db } from "../../../db/client.js";
import { examples } from "../../../db/schema/index.js";
import { createExamplesRepository, escapeLike } from "../repository.js";

let db: Db;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
});
afterEach(() => close());

async function seed(names: string[]) {
  // Explicit, increasing timestamps: the last name is the newest.
  await db
    .insert(examples)
    .values(names.map((name, i) => ({ name, createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)) })));
}

describe("examples repository", () => {
  it("lists newest first and paginates with a total across pages", async () => {
    await seed(["a", "b", "c", "d", "e"]);
    const repo = createExamplesRepository(db);
    const first = await repo.list({ offset: 0, limit: 2 });
    expect(first.total).toBe(5);
    expect(first.rows.map((r) => r.name)).toEqual(["e", "d"]);
    const last = await repo.list({ offset: 4, limit: 2 });
    expect(last.rows.map((r) => r.name)).toEqual(["a"]);
    expect(last.total).toBe(5);
  });

  it("searches case-insensitively and counts only matches", async () => {
    await seed(["Alpha", "beta", "ALPHABET"]);
    const res = await createExamplesRepository(db).list({ offset: 0, limit: 10, search: "alpha" });
    expect(res.rows.map((r) => r.name)).toEqual(["ALPHABET", "Alpha"]);
    expect(res.total).toBe(2);
  });

  it("treats %, _ and backslash in search literally", async () => {
    await seed(["Diskon 50%", "Diskon 500", "a_b", "axb", "c\\d", "cd"]);
    const repo = createExamplesRepository(db);
    const names = async (search: string) =>
      (await repo.list({ offset: 0, limit: 10, search })).rows.map((r) => r.name);
    expect(await names("50%")).toEqual(["Diskon 50%"]);
    expect(await names("a_b")).toEqual(["a_b"]);
    expect(await names("c\\d")).toEqual(["c\\d"]);
  });

  it("inserts with defaults and returns the row", async () => {
    const row = await createExamplesRepository(db).insert({ name: "Baru", note: "catatan" });
    expect(row).toMatchObject({ name: "Baru", note: "catatan", status: "active" });
  });
});

describe("escapeLike", () => {
  it("escapes LIKE wildcards and the escape character", () => {
    expect(escapeLike("50%_a\\b")).toBe("50\\%\\_a\\\\b");
  });
});
