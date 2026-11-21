import type { ExampleRow } from "../../db/schema/index.js";
import type { ExamplesRepository } from "./repository.js";
import type { CreateBody, ExampleItem, ListQuery } from "./schema.js";

const toItem = (row: ExampleRow): ExampleItem => ({
  id: row.id,
  name: row.name,
  status: row.status,
  created_at: row.createdAt.toISOString(),
});

/** Business logic: no Fastify, no SQL. */
export function createExamplesService(repo: ExamplesRepository) {
  return {
    async list(q: ListQuery): Promise<{ items: ExampleItem[]; total: number }> {
      const { rows, total } = await repo.list({
        offset: (q.page - 1) * q.page_size,
        limit: q.page_size,
        search: q.search || undefined,
      });
      return { items: rows.map(toItem), total };
    },

    async create(body: CreateBody): Promise<ExampleItem> {
      return toItem(await repo.insert(body));
    },
  };
}

export type ExamplesService = ReturnType<typeof createExamplesService>;
