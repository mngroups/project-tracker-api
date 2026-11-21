import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { type TaskRow, tasks } from "../../db/schema/index.js";

/** Queries only. Every query filters by `org_id` and `project_id`. */
export function createTasksRepository(db: Db) {
  const inProject = (orgId: string, projectId: string, id: string) =>
    and(eq(tasks.orgId, orgId), eq(tasks.projectId, projectId), eq(tasks.id, id));
  const nextPosition = (milestoneId: string) =>
    sql<number>`(select coalesce(max(position), -1) + 1 from tasks where milestone_id = ${milestoneId})`;

  return {
    async findInProject(orgId: string, projectId: string, id: string): Promise<TaskRow | null> {
      const [row] = await db
        .select()
        .from(tasks)
        .where(inProject(orgId, projectId, id))
        .limit(1);
      return row ?? null;
    },

    /** Appended last: `position = max + 1` within the milestone. */
    async insert(
      orgId: string,
      projectId: string,
      milestoneId: string,
      values: Partial<typeof tasks.$inferInsert> & { title: string }
    ): Promise<TaskRow> {
      const [row] = await db
        .insert(tasks)
        .values({ ...values, orgId, projectId, milestoneId, position: nextPosition(milestoneId) })
        .returning();
      return row as TaskRow;
    },

    /** `moveTo` sends the task to the end of that milestone in the same statement. */
    async update(
      orgId: string,
      projectId: string,
      id: string,
      values: Partial<typeof tasks.$inferInsert>,
      moveTo?: string
    ): Promise<TaskRow | null> {
      const [row] = await db
        .update(tasks)
        .set({
          ...values,
          ...(moveTo && { milestoneId: moveTo, position: nextPosition(moveTo) }),
        })
        .where(inProject(orgId, projectId, id))
        .returning();
      return row ?? null;
    },

    async delete(orgId: string, projectId: string, id: string): Promise<boolean> {
      const rows = await db
        .delete(tasks)
        .where(inProject(orgId, projectId, id))
        .returning({ id: tasks.id });
      return rows.length > 0;
    },
  };
}

export type TasksRepository = ReturnType<typeof createTasksRepository>;
