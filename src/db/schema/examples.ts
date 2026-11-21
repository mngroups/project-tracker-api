import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const EXAMPLE_STATUSES = ["active", "inactive"] as const;

export const examples = pgTable(
  "examples",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 100 }).notNull(),
    note: varchar("note", { length: 500 }).notNull().default(""),
    status: text("status", { enum: EXAMPLE_STATUSES }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("examples_status_check", sql`${table.status} in ('active', 'inactive')`),
    index("examples_created_at_idx").on(table.createdAt.desc()),
  ]
);

export type ExampleRow = typeof examples.$inferSelect;
