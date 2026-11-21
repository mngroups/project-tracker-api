import { envelopeSchema } from "@mono/server-kit";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { callerOf } from "../../auth-context.js";
import { PERMISSIONS } from "../../permissions.js";
import {
  attachmentParamsSchema,
  attachmentSchema,
  commitBodySchema,
  downloadSchema,
  listQuerySchema,
  projectParamsSchema,
} from "./schema.js";
import type { AttachmentsService } from "./service.js";

/** HTTP only: validate, authorize, call the service, reply with the envelope. */
export const projectAttachmentRoutes: FastifyPluginAsyncZod<{
  service: AttachmentsService;
}> = async (app, { service }) => {
  const view = app.requirePermission(PERMISSIONS.view);

  app.get(
    "/v1/projects/:id/attachments",
    {
      preHandler: view,
      schema: {
        params: projectParamsSchema,
        querystring: listQuerySchema,
        response: { 200: envelopeSchema(z.array(attachmentSchema)) },
      },
    },
    async (request, reply) => {
      reply.ok(
        await service.list(callerOf(request.user), request.params.id, request.query.milestone_id)
      );
    }
  );

  app.post(
    "/v1/projects/:id/attachments",
    {
      preHandler: app.requirePermission(PERMISSIONS.attachmentUpload),
      schema: {
        params: projectParamsSchema,
        body: commitBodySchema,
        response: { 201: envelopeSchema(attachmentSchema) },
      },
    },
    async (request, reply) => {
      reply.ok(await service.commit(callerOf(request.user), request.params.id, request.body), {
        code: 201,
        message: "Data berhasil dibuat",
      });
    }
  );

  app.get(
    "/v1/projects/:id/attachments/:aid/download",
    {
      preHandler: view,
      schema: {
        params: attachmentParamsSchema,
        response: { 200: envelopeSchema(downloadSchema) },
      },
    },
    async (request, reply) => {
      const { id, aid } = request.params;
      reply.ok(await service.download(callerOf(request.user), id, aid));
    }
  );

  // Uploader-or-manager is decided in the service; the route only needs `project:view`.
  app.delete(
    "/v1/projects/:id/attachments/:aid",
    {
      preHandler: view,
      schema: { params: attachmentParamsSchema, response: { 200: envelopeSchema(z.null()) } },
    },
    async (request, reply) => {
      const { id, aid } = request.params;
      reply.ok(await service.remove(callerOf(request.user), id, aid));
    }
  );
};
