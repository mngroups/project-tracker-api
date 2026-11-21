import { z } from "zod";

export const milestoneParamsSchema = z.object({ id: z.uuid(), mid: z.uuid() });

const date = z.iso.date();

export const createMilestoneBodySchema = z.object({
  title: z.string().trim().min(1).max(150),
  description: z.string().max(2000).optional(),
  due_date: date.nullable().optional(),
});

export const updateMilestoneBodySchema = z.object({
  title: z.string().trim().min(1).max(150).optional(),
  description: z.string().max(2000).optional(),
  due_date: date.nullable().optional(),
  status: z.enum(["pending", "in_progress"]).optional(),
});

export const reorderBodySchema = z.object({ ids: z.array(z.uuid()) });

export type CreateMilestoneBody = z.infer<typeof createMilestoneBodySchema>;
export type UpdateMilestoneBody = z.infer<typeof updateMilestoneBodySchema>;
