import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { type AttachmentRow, attachments } from "../../db/schema/index.js";

/** Queries only. Every query filters by `org_id` and `project_id`. */
export function createAttachmentsRepository(db: Db) {
  return {
    async list(
      orgId: string,
      projectId: string,
      opts: { milestoneId?: string; includeInternal: boolean }
    ): Promise<AttachmentRow[]> {
      return db
        .select()
        .from(attachments)
        .where(
          and(
            eq(attachments.orgId, orgId),
            eq(attachments.projectId, projectId),
            opts.milestoneId ? eq(attachments.milestoneId, opts.milestoneId) : undefined,
            opts.includeInternal ? undefined : eq(attachments.isInternal, false)
          )
        )
        .orderBy(desc(attachments.createdAt), desc(attachments.id));
    },

    async findInProject(
      orgId: string,
      projectId: string,
      id: string
    ): Promise<AttachmentRow | null> {
      const [row] = await db
        .select()
        .from(attachments)
        .where(
          and(
            eq(attachments.orgId, orgId),
            eq(attachments.projectId, projectId),
            eq(attachments.id, id)
          )
        )
        .limit(1);
      return row ?? null;
    },

    async insert(values: typeof attachments.$inferInsert): Promise<AttachmentRow> {
      const [row] = await db.insert(attachments).values(values).returning();
      return row as AttachmentRow;
    },

    async delete(orgId: string, projectId: string, id: string): Promise<boolean> {
      const rows = await db
        .delete(attachments)
        .where(
          and(
            eq(attachments.orgId, orgId),
            eq(attachments.projectId, projectId),
            eq(attachments.id, id)
          )
        )
        .returning({ id: attachments.id });
      return rows.length > 0;
    },
  };
}

export type AttachmentsRepository = ReturnType<typeof createAttachmentsRepository>;
