import { AppError } from "@mono/server-kit";
import type { Caller } from "../../auth-context.js";
import type { MilestoneRow } from "../../db/schema/index.js";
import type { ProjectsRepository } from "../projects/repository.js";
import type { MilestoneItem } from "../projects/schema.js";
import { MESSAGES as PROJECT_MESSAGES, toMilestone } from "../projects/service.js";
import { type ApprovalAction, nextStatus } from "./approval.js";
import type { MilestonesRepository } from "./repository.js";
import type { CreateMilestoneBody, DecisionBody, UpdateMilestoneBody } from "./schema.js";

export const MESSAGES = {
  notFound: PROJECT_MESSAGES.notFound,
  badOrder: "Urutan milestone tidak valid",
  badStatus: "Status milestone tidak memungkinkan aksi ini",
  noteRequired: "Catatan revisi wajib diisi",
  approvedDelete: "Milestone yang sudah disetujui tidak dapat dihapus",
} as const;

/** Business logic: no Fastify, no SQL. */
export function createMilestonesService(repo: MilestonesRepository, projects: ProjectsRepository) {
  async function mustFindProject(caller: Caller, projectId: string): Promise<void> {
    if (!(await projects.findProject(caller.orgId, projectId))) {
      throw new AppError(404, MESSAGES.notFound);
    }
  }

  async function mustFind(caller: Caller, projectId: string, id: string): Promise<MilestoneRow> {
    await mustFindProject(caller, projectId);
    const row = await repo.findInProject(caller.orgId, projectId, id);
    if (!row) throw new AppError(404, MESSAGES.notFound);
    return row;
  }

  async function present(caller: Caller, row: MilestoneRow): Promise<MilestoneItem> {
    return toMilestone(row, await repo.tasksOf(caller.orgId, row.id, caller.canSeeInternal));
  }

  async function decide(
    caller: Caller,
    projectId: string,
    id: string,
    action: ApprovalAction,
    note: string | undefined
  ): Promise<MilestoneItem> {
    const current = await mustFind(caller, projectId, id);
    const text = note?.trim() || null;
    if (action === "request_changes" && !text) throw new AppError(422, MESSAGES.noteRequired);
    const to = nextStatus(action, current.status);
    if (!to) throw new AppError(422, MESSAGES.badStatus);
    const decided = action !== "submit";
    // Zero rows: the status changed since the read (e.g. a concurrent approve).
    const row = await repo.setStatus(caller.orgId, projectId, id, current.status, {
      status: to,
      decidedBy: decided ? caller.userId : null,
      decidedByName: decided ? caller.userName : null,
      decidedAt: decided ? new Date() : null,
      decisionNote: decided ? text : null,
    });
    if (!row) throw new AppError(422, MESSAGES.badStatus);
    await projects.touch(caller.orgId, projectId);
    return present(caller, row);
  }

  return {
    mustFind,
    present,

    submit: (caller: Caller, projectId: string, id: string, body: DecisionBody) =>
      decide(caller, projectId, id, "submit", body.note),
    approve: (caller: Caller, projectId: string, id: string, body: DecisionBody) =>
      decide(caller, projectId, id, "approve", body.note),
    requestChanges: (caller: Caller, projectId: string, id: string, body: DecisionBody) =>
      decide(caller, projectId, id, "request_changes", body.note),

    async create(caller: Caller, projectId: string, body: CreateMilestoneBody) {
      await mustFindProject(caller, projectId);
      const row = await repo.insert(caller.orgId, projectId, {
        title: body.title,
        ...(body.description !== undefined && { description: body.description }),
        ...(body.due_date !== undefined && { dueDate: body.due_date }),
      });
      await projects.touch(caller.orgId, projectId);
      return present(caller, row);
    },

    async update(caller: Caller, projectId: string, id: string, body: UpdateMilestoneBody) {
      const current = await mustFind(caller, projectId, id);
      if (current.status === "awaiting_approval" || current.status === "approved") {
        throw new AppError(422, MESSAGES.badStatus);
      }
      const row = await repo.update(caller.orgId, projectId, id, {
        ...(body.title !== undefined && { title: body.title }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.due_date !== undefined && { dueDate: body.due_date }),
        ...(body.status !== undefined && { status: body.status }),
      });
      if (!row) throw new AppError(404, MESSAGES.notFound);
      await projects.touch(caller.orgId, projectId);
      return present(caller, row);
    },

    async remove(caller: Caller, projectId: string, id: string): Promise<null> {
      const current = await mustFind(caller, projectId, id);
      if (current.status === "approved") throw new AppError(422, MESSAGES.approvedDelete);
      if (!(await repo.delete(caller.orgId, projectId, id))) {
        throw new AppError(404, MESSAGES.notFound);
      }
      await projects.touch(caller.orgId, projectId);
      return null;
    },

    async reorder(caller: Caller, projectId: string, ids: string[]): Promise<null> {
      await mustFindProject(caller, projectId);
      const existing = await repo.idsOf(caller.orgId, projectId);
      const valid =
        ids.length === existing.length &&
        new Set(ids).size === ids.length &&
        existing.every((id) => ids.includes(id));
      if (!valid) throw new AppError(422, MESSAGES.badOrder);
      await repo.reorder(caller.orgId, projectId, ids);
      await projects.touch(caller.orgId, projectId);
      return null;
    },
  };
}

export type MilestonesService = ReturnType<typeof createMilestonesService>;
