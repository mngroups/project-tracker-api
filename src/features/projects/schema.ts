import { z } from "zod";
import {
  MILESTONE_STATUSES,
  PROJECT_HEALTHS,
  PROJECT_STATUSES,
  TASK_STATUSES,
} from "../../db/schema/index.js";

const date = z.iso.date();
const timestamp = z.string();

export const taskSchema = z.object({
  id: z.string(),
  milestone_id: z.string(),
  title: z.string(),
  status: z.enum(TASK_STATUSES),
  assignee_name: z.string().nullable(),
  due_date: date.nullable(),
  position: z.number(),
  is_internal: z.boolean(),
});

export const milestoneSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  position: z.number(),
  due_date: date.nullable(),
  status: z.enum(MILESTONE_STATUSES),
  progress: z.number(),
  decided_by_name: z.string().nullable(),
  decided_at: timestamp.nullable(),
  decision_note: z.string().nullable(),
  tasks: z.array(taskSchema),
});

export const projectListItemSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  status: z.enum(PROJECT_STATUSES),
  health: z.enum(PROJECT_HEALTHS),
  start_date: date.nullable(),
  target_date: date.nullable(),
  progress: z.number(),
  is_overdue: z.boolean(),
  milestone_count: z.number(),
  milestone_done_count: z.number(),
  awaiting_approval_count: z.number(),
  updated_at: timestamp,
});

export const projectSchema = projectListItemSchema.extend({
  description: z.string(),
  completed_at: timestamp.nullable(),
  milestones: z.array(milestoneSchema),
});

export const projectListSchema = z.object({
  items: z.array(projectListItemSchema),
  total: z.number(),
});

export const projectSummarySchema = z.object({
  total: z.number(),
  on_track: z.number(),
  at_risk: z.number(),
  off_track: z.number(),
  completed: z.number(),
  awaiting_approval: z.number(),
});

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  health: z.enum(PROJECT_HEALTHS).optional(),
});

export const idParamsSchema = z.object({ id: z.uuid() });

const projectFields = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(150),
  description: z.string().max(2000),
  status: z.enum(PROJECT_STATUSES),
  health: z.enum(PROJECT_HEALTHS),
  start_date: date.nullable(),
  target_date: date.nullable(),
});

const targetNotBeforeStart = (v: { start_date?: string | null; target_date?: string | null }) =>
  !v.start_date || !v.target_date || v.target_date >= v.start_date;
const dateOrder = {
  message: "Tanggal target tidak boleh sebelum tanggal mulai",
  path: ["target_date"],
};

export const createBodySchema = projectFields
  .partial()
  .required({ code: true, name: true })
  .refine(targetNotBeforeStart, dateOrder);
export const updateBodySchema = projectFields.partial().refine(targetNotBeforeStart, dateOrder);

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type TaskItem = z.infer<typeof taskSchema>;
export type MilestoneItem = z.infer<typeof milestoneSchema>;
export type ProjectListItem = z.infer<typeof projectListItemSchema>;
export type Project = z.infer<typeof projectSchema>;
export type ProjectSummary = z.infer<typeof projectSummarySchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
export type CreateBody = z.infer<typeof createBodySchema>;
export type UpdateBody = z.infer<typeof updateBodySchema>;
