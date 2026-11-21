import { AppError } from "@mono/server-kit";
import type { Caller } from "../../auth-context.js";
import type { TaskRow } from "../../db/schema/index.js";
import type { MilestonesRepository } from "../milestones/repository.js";
import type { ProjectsRepository } from "../projects/repository.js";
import type { TaskItem } from "../projects/schema.js";
import { MESSAGES, toTask } from "../projects/service.js";
import type { TasksRepository } from "./repository.js";
import type { CreateTaskBody, UpdateTaskBody } from "./schema.js";

type TaskStatus = TaskRow["status"];

/** Business logic: no Fastify, no SQL. */
export function createTasksService(
  repo: TasksRepository,
  milestones: MilestonesRepository,
  projects: ProjectsRepository
) {
  const notFound = () => new AppError(404, MESSAGES.notFound);

  async function mustFindProject(caller: Caller, projectId: string): Promise<void> {
    if (!(await projects.findProject(caller.orgId, projectId))) throw notFound();
  }

  async function mustFindMilestone(caller: Caller, projectId: string, id: string): Promise<void> {
    await mustFindProject(caller, projectId);
    if (!(await milestones.findInProject(caller.orgId, projectId, id))) throw notFound();
  }

  /** Internal tasks do not exist for callers who may not see them. */
  async function mustFindTask(caller: Caller, projectId: string, id: string): Promise<TaskRow> {
    await mustFindProject(caller, projectId);
    const row = await repo.findInProject(caller.orgId, projectId, id);
    if (!row || (row.isInternal && !caller.canSeeInternal)) throw notFound();
    return row;
  }

  const fields = (body: Partial<CreateTaskBody>) => ({
    ...(body.assignee_name !== undefined && { assigneeName: body.assignee_name }),
    ...(body.due_date !== undefined && { dueDate: body.due_date }),
    ...(body.is_internal !== undefined && { isInternal: body.is_internal }),
  });

  return {
    async create(
      caller: Caller,
      projectId: string,
      milestoneId: string,
      body: CreateTaskBody
    ): Promise<TaskItem> {
      await mustFindMilestone(caller, projectId, milestoneId);
      const row = await repo.insert(caller.orgId, projectId, milestoneId, {
        ...fields(body),
        title: body.title,
      });
      await projects.touch(caller.orgId, projectId);
      return toTask(row);
    },

    async update(
      caller: Caller,
      projectId: string,
      id: string,
      body: UpdateTaskBody
    ): Promise<TaskItem> {
      const current = await mustFindTask(caller, projectId, id);
      const moveTo =
        body.milestone_id && body.milestone_id !== current.milestoneId
          ? body.milestone_id
          : undefined;
      if (moveTo) await mustFindMilestone(caller, projectId, moveTo);
      const row = await repo.update(
        caller.orgId,
        projectId,
        id,
        {
          ...fields(body),
          ...(body.title !== undefined && { title: body.title }),
          ...(body.status !== undefined && { status: body.status }),
        },
        moveTo
      );
      if (!row) throw notFound();
      await projects.touch(caller.orgId, projectId);
      return toTask(row);
    },

    async setStatus(
      caller: Caller,
      projectId: string,
      id: string,
      status: TaskStatus
    ): Promise<TaskItem> {
      await mustFindTask(caller, projectId, id);
      const row = await repo.update(caller.orgId, projectId, id, { status });
      if (!row) throw notFound();
      await projects.touch(caller.orgId, projectId);
      return toTask(row);
    },

    async remove(caller: Caller, projectId: string, id: string): Promise<null> {
      await mustFindTask(caller, projectId, id);
      if (!(await repo.delete(caller.orgId, projectId, id))) throw notFound();
      await projects.touch(caller.orgId, projectId);
      return null;
    },
  };
}

export type TasksService = ReturnType<typeof createTasksService>;
