import { AppError } from "@mono/server-kit";
import type { Caller } from "../../auth-context.js";
import type { MilestoneRow, ProjectRow, TaskRow } from "../../db/schema/index.js";
import { isOverdue, progressOf } from "./progress.js";
import {
  isUniqueViolation,
  type ProjectsRepository,
  type ProjectWithCounts,
} from "./repository.js";
import type {
  CreateBody,
  ListQuery,
  MilestoneItem,
  Project,
  ProjectListItem,
  ProjectSummary,
  TaskItem,
  UpdateBody,
} from "./schema.js";

export const MESSAGES = {
  notFound: "Data tidak ditemukan",
  duplicateCode: "Kode project sudah dipakai",
  dateOrder: "Tanggal target tidak boleh sebelum tanggal mulai",
} as const;

type Counts = Pick<
  ProjectWithCounts,
  "taskTotal" | "taskDone" | "milestoneCount" | "milestoneDone" | "awaitingCount"
>;

const today = () => new Date().toISOString().slice(0, 10);

const toListItem = (row: ProjectRow, c: Counts): ProjectListItem => ({
  id: row.id,
  code: row.code,
  name: row.name,
  status: row.status,
  health: row.health,
  start_date: row.startDate,
  target_date: row.targetDate,
  progress: progressOf(c.taskDone, c.taskTotal),
  is_overdue: isOverdue(row.targetDate, row.status, today()),
  milestone_count: c.milestoneCount,
  milestone_done_count: c.milestoneDone,
  awaiting_approval_count: c.awaitingCount,
  updated_at: row.updatedAt.toISOString(),
});

const toTask = (t: TaskRow): TaskItem => ({
  id: t.id,
  milestone_id: t.milestoneId,
  title: t.title,
  status: t.status,
  assignee_name: t.assigneeName,
  due_date: t.dueDate,
  position: t.position,
  is_internal: t.isInternal,
});

const toMilestone = (m: MilestoneRow, tasks: TaskRow[]): MilestoneItem => ({
  id: m.id,
  title: m.title,
  description: m.description,
  position: m.position,
  due_date: m.dueDate,
  status: m.status,
  progress: progressOf(tasks.filter((t) => t.status === "done").length, tasks.length),
  decided_by_name: m.decidedByName,
  decided_at: m.decidedAt?.toISOString() ?? null,
  decision_note: m.decisionNote,
  tasks: tasks.map(toTask),
});

/** Business logic: no Fastify, no SQL. */
export function createProjectsService(repo: ProjectsRepository) {
  async function detail(caller: Caller, row: ProjectRow): Promise<Project> {
    const [ms, ts] = await Promise.all([
      repo.milestonesOf(caller.orgId, row.id),
      repo.tasksOf(caller.orgId, row.id, caller.canSeeInternal),
    ]);
    const byMilestone = new Map<string, TaskRow[]>();
    for (const t of ts)
      byMilestone.set(t.milestoneId, [...(byMilestone.get(t.milestoneId) ?? []), t]);
    const done = ts.filter((t) => t.status === "done").length;
    return {
      ...toListItem(row, {
        taskTotal: ts.length,
        taskDone: done,
        milestoneCount: ms.length,
        milestoneDone: ms.filter((m) => m.status === "approved").length,
        awaitingCount: ms.filter((m) => m.status === "awaiting_approval").length,
      }),
      description: row.description,
      completed_at: row.completedAt?.toISOString() ?? null,
      milestones: ms.map((m) => toMilestone(m, byMilestone.get(m.id) ?? [])),
    };
  }

  async function mustFind(caller: Caller, id: string): Promise<ProjectRow> {
    const row = await repo.findProject(caller.orgId, id);
    if (!row) throw new AppError(404, MESSAGES.notFound);
    return row;
  }

  const values = (body: UpdateBody) => ({
    ...(body.code !== undefined && { code: body.code }),
    ...(body.name !== undefined && { name: body.name }),
    ...(body.description !== undefined && { description: body.description }),
    ...(body.status !== undefined && { status: body.status }),
    ...(body.health !== undefined && { health: body.health }),
    ...(body.start_date !== undefined && { startDate: body.start_date }),
    ...(body.target_date !== undefined && { targetDate: body.target_date }),
  });

  return {
    async list(caller: Caller, q: ListQuery): Promise<{ items: ProjectListItem[]; total: number }> {
      const { rows, total } = await repo.list(caller, {
        offset: (q.page - 1) * q.page_size,
        limit: q.page_size,
        search: q.search || undefined,
        status: q.status,
        health: q.health,
      });
      return { items: rows.map((r) => toListItem(r, r)), total };
    },

    async summary(caller: Caller): Promise<ProjectSummary> {
      const s = await repo.summary(caller.orgId);
      return {
        total: s.total,
        on_track: s.onTrack,
        at_risk: s.atRisk,
        off_track: s.offTrack,
        completed: s.completed,
        awaiting_approval: s.awaiting,
      };
    },

    /** Fresh state of one project, as this caller may see it. Used by the nested features too. */
    async getDetail(caller: Caller, id: string): Promise<Project> {
      return detail(caller, await mustFind(caller, id));
    },

    async create(caller: Caller, body: CreateBody): Promise<Project> {
      try {
        const row = await repo.insert({
          ...values(body),
          code: body.code,
          name: body.name,
          orgId: caller.orgId,
          createdBy: caller.userId,
          completedAt: body.status === "completed" ? new Date() : null,
        });
        return await detail(caller, row);
      } catch (err) {
        if (isUniqueViolation(err)) throw new AppError(409, MESSAGES.duplicateCode);
        throw err;
      }
    },

    async update(caller: Caller, id: string, body: UpdateBody): Promise<Project> {
      const current = await mustFind(caller, id);
      const start = body.start_date === undefined ? current.startDate : body.start_date;
      const target = body.target_date === undefined ? current.targetDate : body.target_date;
      if (start && target && target < start) throw new AppError(422, MESSAGES.dateOrder);

      const completedAt =
        body.status === undefined
          ? {}
          : {
              completedAt: body.status !== "completed" ? null : (current.completedAt ?? new Date()),
            };
      try {
        const row = await repo.update(caller.orgId, id, { ...values(body), ...completedAt });
        if (!row) throw new AppError(404, MESSAGES.notFound);
        return await detail(caller, row);
      } catch (err) {
        if (isUniqueViolation(err)) throw new AppError(409, MESSAGES.duplicateCode);
        throw err;
      }
    },

    async archive(caller: Caller, id: string): Promise<null> {
      if (!(await repo.archive(caller.orgId, id))) throw new AppError(404, MESSAGES.notFound);
      return null;
    },
  };
}

export type ProjectsService = ReturnType<typeof createProjectsService>;
