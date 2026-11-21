import { z } from "zod";

export const attachmentSchema = z.object({
  id: z.string(),
  milestone_id: z.string().nullable(),
  file_name: z.string(),
  content_type: z.string(),
  size: z.number(),
  uploaded_by_name: z.string(),
  is_internal: z.boolean(),
  created_at: z.string(),
  can_delete: z.boolean(),
});

export const downloadSchema = z.object({ url: z.string(), expires_in: z.number() });

export const projectParamsSchema = z.object({ id: z.uuid() });
export const attachmentParamsSchema = z.object({ id: z.uuid(), aid: z.uuid() });
export const listQuerySchema = z.object({ milestone_id: z.uuid().optional() });

export const commitBodySchema = z.object({
  upload_uuid: z.string().min(1).max(100),
  s3_key: z.string().min(1).max(600),
  file_name: z.string().trim().min(1).max(255),
  milestone_id: z.uuid().optional(),
  is_internal: z.boolean().optional(),
});

export type Attachment = z.infer<typeof attachmentSchema>;
export type CommitBody = z.infer<typeof commitBodySchema>;
