import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { type MilestoneRow, milestones, type TaskRow, tasks } from "../../db/schema/index.js";

/** Queries only. Every query filters by `org_id` and, where it applies, `project_id`. */
export function createMilestonesRepository(db: Db) {
  const inProject = (orgId: string, projectId: string, id: string) =>
    and(eq(milestones.orgId, orgId), eq(milestones.projectId, projectId), eq(milestones.id, id));

  return {
    async findInProject(
      orgId: string,
      projectId: string,
      milestoneId: string
    ): Promise<MilestoneRow | null> {
      const [row] = await db
        .select()
        .from(milestones)
        .where(inProject(orgId, projectId, milestoneId))
        .limit(1);
      return row ?? null;
    },

    tasksOf(orgId: string, milestoneId: string, canSeeInternal: boolean): Promise<TaskRow[]> {
      return db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.orgId, orgId),
            eq(tasks.milestoneId, milestoneId),
            canSeeInternal ? undefined : eq(tasks.isInternal, false)
          )
        )
        .orderBy(asc(tasks.position), asc(tasks.id));
    },

    /** Appended last: `position = max + 1` within the project. */
    async insert(
      orgId: string,
      projectId: string,
      values: { title: string; description?: string; dueDate?: string | null }
    ): Promise<MilestoneRow> {
      const [row] = await db
        .insert(milestones)
        .values({
          ...values,
          orgId,
          projectId,
          position: sql`(select coalesce(max(position), -1) + 1 from milestones where project_id = ${projectId})`,
        })
        .returning();
      return row as MilestoneRow;
    },

    async update(
      orgId: string,
      projectId: string,
      id: string,
      values: Partial<typeof milestones.$inferInsert>
    ): Promise<MilestoneRow | null> {
      const [row] = await db
        .update(milestones)
        .set(values)
        .where(inProject(orgId, projectId, id))
        .returning();
      return row ?? null;
    },

    async delete(orgId: string, projectId: string, id: string): Promise<boolean> {
      const rows = await db
        .delete(milestones)
        .where(inProject(orgId, projectId, id))
        .returning({ id: milestones.id });
      return rows.length > 0;
    },

    async idsOf(orgId: string, projectId: string): Promise<string[]> {
      const rows = await db
        .select({ id: milestones.id })
        .from(milestones)
        .where(and(eq(milestones.orgId, orgId), eq(milestones.projectId, projectId)));
      return rows.map((r) => r.id);
    },

    /** `position = index`, all or nothing. */
    async reorder(orgId: string, projectId: string, ids: string[]): Promise<void> {
      await db.transaction(async (tx) => {
        for (const [position, id] of ids.entries()) {
          await tx
            .update(milestones)
            .set({ position })
            .where(inProject(orgId, projectId, id));
        }
      });
    },
  };
}

export type MilestonesRepository = ReturnType<typeof createMilestonesRepository>;
