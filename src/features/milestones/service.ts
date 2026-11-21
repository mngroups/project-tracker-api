import { AppError } from "@mono/server-kit";
import type { Caller } from "../../auth-context.js";
import type { MilestoneRow } from "../../db/schema/index.js";
import type { ProjectsRepository } from "../projects/repository.js";
import type { MilestoneItem } from "../projects/schema.js";
import { MESSAGES as PROJECT_MESSAGES, toMilestone } from "../projects/service.js";
import type { MilestonesRepository } from "./repository.js";
import type { CreateMilestoneBody, UpdateMilestoneBody } from "./schema.js";

export const MESSAGES = {
  notFound: PROJECT_MESSAGES.notFound,
  badOrder: "Urutan milestone tidak valid",
  badStatus: "Status milestone tidak memungkinkan aksi ini",
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

  return {
    mustFind,
    present,

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
