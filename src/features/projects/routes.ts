import { envelopeSchema } from "@mono/server-kit";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { callerOf } from "../../auth-context.js";
import { PERMISSIONS } from "../../permissions.js";
import {
  createBodySchema,
  idParamsSchema,
  listQuerySchema,
  projectListSchema,
  projectSchema,
  projectSummarySchema,
  updateBodySchema,
} from "./schema.js";
import type { ProjectsService } from "./service.js";

// #region handbook:feature-layering
/** HTTP only: validate, authorize, call the service, reply with the envelope. */
export const projectRoutes: FastifyPluginAsyncZod<{ service: ProjectsService }> = async (
  app,
  { service }
) => {
  app.get(
    "/v1/projects",
    {
      preHandler: app.requirePermission(PERMISSIONS.view),
      schema: {
        querystring: listQuerySchema,
        response: { 200: envelopeSchema(projectListSchema) },
      },
    },
    async (request, reply) => {
      reply.ok(await service.list(callerOf(request.user), request.query));
    }
  );

  // Static segment: find-my-way prefers it over `/v1/projects/:id`.
  app.get(
    "/v1/projects/summary",
    {
      preHandler: app.requirePermission(PERMISSIONS.view),
      schema: { response: { 200: envelopeSchema(projectSummarySchema) } },
    },
    async (request, reply) => {
      reply.ok(await service.summary(callerOf(request.user)));
    }
  );

  app.get(
    "/v1/projects/:id",
    {
      preHandler: app.requirePermission(PERMISSIONS.view),
      schema: { params: idParamsSchema, response: { 200: envelopeSchema(projectSchema) } },
    },
    async (request, reply) => {
      reply.ok(await service.getDetail(callerOf(request.user), request.params.id));
    }
  );

  app.post(
    "/v1/projects",
    {
      preHandler: app.requirePermission(PERMISSIONS.manage),
      schema: { body: createBodySchema, response: { 201: envelopeSchema(projectSchema) } },
    },
    async (request, reply) => {
      reply.ok(await service.create(callerOf(request.user), request.body), {
        code: 201,
        message: "Data berhasil dibuat",
      });
    }
  );

  app.patch(
    "/v1/projects/:id",
    {
      preHandler: app.requirePermission(PERMISSIONS.manage),
      schema: {
        params: idParamsSchema,
        body: updateBodySchema,
        response: { 200: envelopeSchema(projectSchema) },
      },
    },
    async (request, reply) => {
      reply.ok(await service.update(callerOf(request.user), request.params.id, request.body));
    }
  );

  app.delete(
    "/v1/projects/:id",
    {
      preHandler: app.requirePermission(PERMISSIONS.manage),
      schema: { params: idParamsSchema, response: { 200: envelopeSchema(z.null()) } },
    },
    async (request, reply) => {
      reply.ok(await service.archive(callerOf(request.user), request.params.id));
    }
  );
};
// #endregion
