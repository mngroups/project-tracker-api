import { envelopeSchema } from "@mono/server-kit";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { callerOf } from "../../auth-context.js";
import { PERMISSIONS } from "../../permissions.js";
import { idParamsSchema, milestoneSchema } from "../projects/schema.js";
import {
  createMilestoneBodySchema,
  milestoneParamsSchema,
  reorderBodySchema,
  updateMilestoneBodySchema,
} from "./schema.js";
import type { MilestonesService } from "./service.js";

/** HTTP only: validate, authorize, call the service, reply with the envelope. */
export const milestoneRoutes: FastifyPluginAsyncZod<{ service: MilestonesService }> = async (
  app,
  { service }
) => {
  const manage = app.requirePermission(PERMISSIONS.manage);

  app.post(
    "/v1/projects/:id/milestones",
    {
      preHandler: manage,
      schema: {
        params: idParamsSchema,
        body: createMilestoneBodySchema,
        response: { 201: envelopeSchema(milestoneSchema) },
      },
    },
    async (request, reply) => {
      reply.ok(await service.create(callerOf(request.user), request.params.id, request.body), {
        code: 201,
        message: "Data berhasil dibuat",
      });
    }
  );

  // PUT vs `/:mid` (PATCH/DELETE): no clash, and the static segment wins anyway.
  app.put(
    "/v1/projects/:id/milestones/order",
    {
      preHandler: manage,
      schema: {
        params: idParamsSchema,
        body: reorderBodySchema,
        response: { 200: envelopeSchema(z.null()) },
      },
    },
    async (request, reply) => {
      reply.ok(await service.reorder(callerOf(request.user), request.params.id, request.body.ids));
    }
  );

  app.patch(
    "/v1/projects/:id/milestones/:mid",
    {
      preHandler: manage,
      schema: {
        params: milestoneParamsSchema,
        body: updateMilestoneBodySchema,
        response: { 200: envelopeSchema(milestoneSchema) },
      },
    },
    async (request, reply) => {
      const { id, mid } = request.params;
      reply.ok(await service.update(callerOf(request.user), id, mid, request.body));
    }
  );

  app.delete(
    "/v1/projects/:id/milestones/:mid",
    {
      preHandler: manage,
      schema: { params: milestoneParamsSchema, response: { 200: envelopeSchema(z.null()) } },
    },
    async (request, reply) => {
      const { id, mid } = request.params;
      reply.ok(await service.remove(callerOf(request.user), id, mid));
    }
  );
};
