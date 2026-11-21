import { count, desc, ilike, type SQL } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { type ExampleRow, examples } from "../../db/schema/index.js";

/** Escapes LIKE wildcards so user input matches literally (Postgres' default escape is `\`). */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

/** Queries only: no business rules, no HTTP. */
export function createExamplesRepository(db: Db) {
  return {
    async list(p: {
      offset: number;
      limit: number;
      search?: string;
    }): Promise<{ rows: ExampleRow[]; total: number }> {
      const where: SQL | undefined = p.search
        ? ilike(examples.name, `%${escapeLike(p.search)}%`)
        : undefined;
      const [rows, totals] = await Promise.all([
        db
          .select()
          .from(examples)
          .where(where)
          .orderBy(desc(examples.createdAt), desc(examples.id))
          .limit(p.limit)
          .offset(p.offset),
        db.select({ total: count() }).from(examples).where(where),
      ]);
      // count() always yields exactly one row.
      return { rows, total: (totals[0] as { total: number }).total };
    },

    async insert(values: { name: string; note: string }): Promise<ExampleRow> {
      const [row] = await db.insert(examples).values(values).returning();
      return row as ExampleRow;
    },
  };
}

export type ExamplesRepository = ReturnType<typeof createExamplesRepository>;
