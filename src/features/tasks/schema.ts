import { z } from "zod";
import { TASK_STATUSES } from "../../db/schema/index.js";

const date = z.iso.date();

export const taskParamsSchema = z.object({ id: z.uuid(), tid: z.uuid() });
export const milestoneTasksParamsSchema = z.object({ id: z.uuid(), mid: z.uuid() });

export const createTaskBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  assignee_name: z.string().trim().max(100).nullable().optional(),
  due_date: date.nullable().optional(),
  is_internal: z.boolean().optional(),
});

export const updateTaskBodySchema = createTaskBodySchema.partial().extend({
  milestone_id: z.uuid().optional(),
  status: z.enum(TASK_STATUSES).optional(),
});

export const statusBodySchema = z.object({ status: z.enum(TASK_STATUSES) });

export type CreateTaskBody = z.infer<typeof createTaskBodySchema>;
export type UpdateTaskBody = z.infer<typeof updateTaskBodySchema>;
