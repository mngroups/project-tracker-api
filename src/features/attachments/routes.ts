import { presignResponseSchema } from "@mono/auth";
import { envelopeSchema } from "@mono/server-kit";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Presigner } from "../../app.js";

export type AttachmentRoutesOptions = {
  presigner: Presigner;
  maxBytes: number;
  allowedTypes: readonly string[];
};

/**
 * Browser → storage uploads: the FE's presign Server Action calls this, then the
 * browser posts the file straight to `presign_url`. The app's own commit endpoint
 * later maps `upload_uuid` back to `s3_key`.
 */
export const attachmentRoutes: FastifyPluginAsyncZod<AttachmentRoutesOptions> = async (
  app,
  { presigner, maxBytes, allowedTypes }
) => {
  app.post(
    "/v1/attachments/presign",
    {
      schema: {
        body: z.object({
          filename: z.string().min(1).max(255),
          content_type: z.string().min(1),
          size: z.number().int().positive(),
        }),
        response: { 200: envelopeSchema(presignResponseSchema) },
      },
    },
    async (request, reply) => {
      const { filename, content_type, size } = request.body;
      reply.ok(
        await presigner.presign({
          filename,
          contentType: content_type,
          size,
          maxBytes,
          allowedTypes,
        })
      );
    }
  );
};
