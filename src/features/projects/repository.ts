import { and, asc, count, desc, eq, ilike, isNull, or, type SQL, sql } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import {
  type MilestoneRow,
  milestones,
  type ProjectRow,
  projects,
  type TaskRow,
  tasks,
} from "../../db/schema/index.js";

/** Escapes LIKE wildcards so user input matches literally (Postgres' default escape is `\`). */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

/** Postgres unique_violation, however the driver wraps it. */
export function isUniqueViolation(err: unknown): boolean {
  for (let e = err as { code?: string; cause?: unknown } | undefined; e; ) {
    if (e.code === "23505") return true;
    e = e.cause as typeof e;
  }
  return false;
}

export type Scope = { orgId: string; canSeeInternal: boolean };
export type ProjectWithCounts = ProjectRow & {
  taskTotal: number;
  taskDone: number;
  milestoneCount: number;
  milestoneDone: number;
  awaitingCount: number;
};

const num = (e: SQL) => e.mapWith(Number);

/** Queries only: no business rules, no HTTP. Every query filters by `org_id`. */
export function createProjectsRepository(db: Db) {
  return {
    /** Archived projects count as missing. */
    async findProject(orgId: string, id: string): Promise<ProjectRow | null> {
      const [row] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.orgId, orgId), eq(projects.id, id), isNull(projects.archivedAt)))
        .limit(1);
      return row ?? null;
    },

    /** One aggregate query: tasks and milestones are summarised per project, then joined. */
    async list(
      scope: Scope,
      p: { offset: number; limit: number; search?: string; status?: string; health?: string }
    ): Promise<{ rows: ProjectWithCounts[]; total: number }> {
      const where = and(
        eq(projects.orgId, scope.orgId),
        isNull(projects.archivedAt),
        p.status ? sql`${projects.status} = ${p.status}` : undefined,
        p.health ? sql`${projects.health} = ${p.health}` : undefined,
        p.search
          ? or(
              ilike(projects.name, `%${escapeLike(p.search)}%`),
              ilike(projects.code, `%${escapeLike(p.search)}%`)
            )
          : undefined
      );
      const tc = db
        .select({
          projectId: tasks.projectId,
          total: num(sql`count(*)`).as("task_total"),
          done: num(sql`count(*) filter (where ${tasks.status} = 'done')`).as("task_done"),
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.orgId, scope.orgId),
            scope.canSeeInternal ? undefined : eq(tasks.isInternal, false)
          )
        )
        .groupBy(tasks.projectId)
        .as("tc");
      const mc = db
        .select({
          projectId: milestones.projectId,
          total: num(sql`count(*)`).as("ms_total"),
          done: num(sql`count(*) filter (where ${milestones.status} = 'approved')`).as("ms_done"),
          awaiting: num(sql`count(*) filter (where ${milestones.status} = 'awaiting_approval')`).as(
            "ms_awaiting"
          ),
        })
        .from(milestones)
        .where(eq(milestones.orgId, scope.orgId))
        .groupBy(milestones.projectId)
        .as("mc");

      const [rows, totals] = await Promise.all([
        db
          .select({
            project: projects,
            taskTotal: sql<number>`coalesce(${tc.total}, 0)`.mapWith(Number),
            taskDone: sql<number>`coalesce(${tc.done}, 0)`.mapWith(Number),
            milestoneCount: sql<number>`coalesce(${mc.total}, 0)`.mapWith(Number),
            milestoneDone: sql<number>`coalesce(${mc.done}, 0)`.mapWith(Number),
            awaitingCount: sql<number>`coalesce(${mc.awaiting}, 0)`.mapWith(Number),
          })
          .from(projects)
          .leftJoin(tc, eq(tc.projectId, projects.id))
          .leftJoin(mc, eq(mc.projectId, projects.id))
          .where(where)
          .orderBy(desc(projects.updatedAt), desc(projects.id))
          .limit(p.limit)
          .offset(p.offset),
        db.select({ total: count() }).from(projects).where(where),
      ]);
      return {
        rows: rows.map(({ project, ...counts }) => ({ ...project, ...counts })),
        // count() always yields exactly one row.
        total: (totals[0] as { total: number }).total,
      };
    },

    async summary(orgId: string) {
      const open = sql`${projects.status} not in ('completed', 'cancelled')`;
      const [row] = await db
        .select({
          total: num(sql`count(*)`),
          onTrack: num(sql`count(*) filter (where ${open} and ${projects.health} = 'on_track')`),
          atRisk: num(sql`count(*) filter (where ${open} and ${projects.health} = 'at_risk')`),
          offTrack: num(sql`count(*) filter (where ${open} and ${projects.health} = 'off_track')`),
          completed: num(sql`count(*) filter (where ${projects.status} = 'completed')`),
          // Raw names: a single-table select renders columns unqualified, which would
          // make the correlated `projects.id` ambiguous.
          awaiting: num(
            sql`count(*) filter (where exists (select 1 from milestones m where m.project_id = projects.id and m.status = 'awaiting_approval'))`
          ),
        })
        .from(projects)
        .where(and(eq(projects.orgId, orgId), isNull(projects.archivedAt)));
      return row as NonNullable<typeof row>;
    },

    milestonesOf(orgId: string, projectId: string): Promise<MilestoneRow[]> {
      return db
        .select()
        .from(milestones)
        .where(and(eq(milestones.orgId, orgId), eq(milestones.projectId, projectId)))
        .orderBy(asc(milestones.position), asc(milestones.id));
    },

    tasksOf(orgId: string, projectId: string, canSeeInternal: boolean): Promise<TaskRow[]> {
      return db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.orgId, orgId),
            eq(tasks.projectId, projectId),
            canSeeInternal ? undefined : eq(tasks.isInternal, false)
          )
        )
        .orderBy(asc(tasks.position), asc(tasks.id));
    },

    async insert(values: typeof projects.$inferInsert): Promise<ProjectRow> {
      const [row] = await db.insert(projects).values(values).returning();
      return row as ProjectRow;
    },

    async update(
      orgId: string,
      id: string,
      values: Partial<typeof projects.$inferInsert>
    ): Promise<ProjectRow | null> {
      const [row] = await db
        .update(projects)
        .set(values)
        .where(and(eq(projects.orgId, orgId), eq(projects.id, id), isNull(projects.archivedAt)))
        .returning();
      return row ?? null;
    },

    async archive(orgId: string, id: string): Promise<boolean> {
      const rows = await db
        .update(projects)
        .set({ archivedAt: new Date() })
        .where(and(eq(projects.orgId, orgId), eq(projects.id, id), isNull(projects.archivedAt)))
        .returning({ id: projects.id });
      return rows.length > 0;
    },

    /** Bumps `updated_at`; call after any child (milestone, task, file) change. */
    async touch(orgId: string, id: string): Promise<void> {
      await db
        .update(projects)
        .set({ updatedAt: new Date() })
        .where(and(eq(projects.orgId, orgId), eq(projects.id, id)));
    },
  };
}

export type ProjectsRepository = ReturnType<typeof createProjectsRepository>;
