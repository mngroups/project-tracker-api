import { AppError, MESSAGES as KIT_MESSAGES } from "@mono/server-kit";
import type { Presigner } from "../../app.js";
import type { Caller } from "../../auth-context.js";
import type { AttachmentRow } from "../../db/schema/index.js";
import type { MilestonesRepository } from "../milestones/repository.js";
import type { ProjectsRepository } from "../projects/repository.js";
import { isUniqueViolation } from "../projects/repository.js";
import { MESSAGES } from "../projects/service.js";
import type { AttachmentsRepository } from "./repository.js";
import type { Attachment, CommitBody } from "./schema.js";

export const DOWNLOAD_EXPIRES_IN = 300;

export const MESSAGES_ATTACHMENT = {
  invalidFile: "File tidak valid",
  duplicate: "File sudah tersimpan",
} as const;

/** Business logic: no Fastify, no SQL. */
export function createAttachmentsService(
  repo: AttachmentsRepository,
  presigner: Pick<Presigner, "stat" | "presignDownload">,
  milestones: MilestonesRepository,
  projects: ProjectsRepository
) {
  const notFound = () => new AppError(404, MESSAGES.notFound);

  async function mustFindProject(caller: Caller, projectId: string): Promise<void> {
    if (!(await projects.findProject(caller.orgId, projectId))) throw notFound();
  }

  /** Internal files do not exist for callers who may not see them. */
  async function mustFind(caller: Caller, projectId: string, id: string): Promise<AttachmentRow> {
    await mustFindProject(caller, projectId);
    const row = await repo.findInProject(caller.orgId, projectId, id);
    if (!row || (row.isInternal && !caller.canSeeInternal)) throw notFound();
    return row;
  }

  const canDelete = (caller: Caller, row: AttachmentRow) =>
    caller.canManage || row.uploadedBy === caller.userId;

  const toAttachment = (caller: Caller, row: AttachmentRow): Attachment => ({
    id: row.id,
    milestone_id: row.milestoneId,
    file_name: row.fileName,
    content_type: row.contentType,
    size: row.size,
    uploaded_by_name: row.uploadedByName,
    is_internal: row.isInternal,
    created_at: row.createdAt.toISOString(),
    can_delete: canDelete(caller, row),
  });

  return {
    async list(caller: Caller, projectId: string, milestoneId?: string): Promise<Attachment[]> {
      await mustFindProject(caller, projectId);
      const rows = await repo.list(caller.orgId, projectId, {
        milestoneId,
        includeInternal: caller.canSeeInternal,
      });
      return rows.map((row) => toAttachment(caller, row));
    },

    async commit(caller: Caller, projectId: string, body: CommitBody): Promise<Attachment> {
      await mustFindProject(caller, projectId);
      if (body.is_internal && !caller.canSeeInternal) {
        throw new AppError(403, KIT_MESSAGES.forbidden);
      }
      if (
        body.milestone_id &&
        !(await milestones.findInProject(caller.orgId, projectId, body.milestone_id))
      ) {
        throw notFound();
      }
      // The key must belong to this upload, and the object must really be in storage.
      if (!body.s3_key.startsWith(`uploads/${body.upload_uuid}/`)) {
        throw new AppError(422, MESSAGES_ATTACHMENT.invalidFile);
      }
      const stored = await presigner.stat(body.s3_key);
      if (!stored) throw new AppError(422, MESSAGES_ATTACHMENT.invalidFile);

      try {
        const row = await repo.insert({
          orgId: caller.orgId,
          projectId,
          milestoneId: body.milestone_id ?? null,
          fileName: body.file_name,
          contentType: stored.contentType,
          size: stored.size,
          s3Key: body.s3_key,
          uploadedBy: caller.userId,
          uploadedByName: caller.userName,
          isInternal: body.is_internal ?? false,
        });
        await projects.touch(caller.orgId, projectId);
        return toAttachment(caller, row);
      } catch (err) {
        if (isUniqueViolation(err)) throw new AppError(409, MESSAGES_ATTACHMENT.duplicate);
        throw err;
      }
    },

    async download(
      caller: Caller,
      projectId: string,
      id: string
    ): Promise<{ url: string; expires_in: number }> {
      const row = await mustFind(caller, projectId, id);
      return presigner.presignDownload({
        key: row.s3Key,
        filename: row.fileName,
        expiresInSeconds: DOWNLOAD_EXPIRES_IN,
      });
    },

    /** The storage object stays for a lifecycle rule. */
    async remove(caller: Caller, projectId: string, id: string): Promise<null> {
      const row = await mustFind(caller, projectId, id);
      if (!canDelete(caller, row)) throw new AppError(403, KIT_MESSAGES.forbidden);
      if (!(await repo.delete(caller.orgId, projectId, id))) throw notFound();
      await projects.touch(caller.orgId, projectId);
      return null;
    },
  };
}

export type AttachmentsService = ReturnType<typeof createAttachmentsService>;
