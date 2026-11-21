import { z } from "zod";
import { EXAMPLE_STATUSES } from "../../db/schema/index.js";

/** The FE's `exampleItemSchema` (monexa-app-template/features/example/schema.ts). */
export const exampleItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(EXAMPLE_STATUSES),
  created_at: z.string(),
});

export const exampleListSchema = z.object({
  items: z.array(exampleItemSchema),
  total: z.number(),
});

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
});

export const createBodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  note: z.string().max(500).default(""),
});

export type ExampleItem = z.infer<typeof exampleItemSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
export type CreateBody = z.infer<typeof createBodySchema>;
