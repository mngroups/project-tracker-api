import { envelopeSchema } from "@mono/server-kit";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { callerOf } from "../../auth-context.js";
import { PERMISSIONS } from "../../permissions.js";
import { taskSchema } from "../projects/schema.js";
import {
  createTaskBodySchema,
  milestoneTasksParamsSchema,
  statusBodySchema,
  taskParamsSchema,
  updateTaskBodySchema,
} from "./schema.js";
import type { TasksService } from "./service.js";

/** HTTP only: validate, authorize, call the service, reply with the envelope. */
export const taskRoutes: FastifyPluginAsyncZod<{ service: TasksService }> = async (
  app,
  { service }
) => {
  const manage = app.requirePermission(PERMISSIONS.manage);

  app.post(
    "/v1/projects/:id/milestones/:mid/tasks",
    {
      preHandler: manage,
      schema: {
        params: milestoneTasksParamsSchema,
        body: createTaskBodySchema,
        response: { 201: envelopeSchema(taskSchema) },
      },
    },
    async (request, reply) => {
      const { id, mid } = request.params;
      reply.ok(await service.create(callerOf(request.user), id, mid, request.body), {
        code: 201,
        message: "Data berhasil dibuat",
      });
    }
  );

  app.patch(
    "/v1/projects/:id/tasks/:tid",
    {
      preHandler: manage,
      schema: {
        params: taskParamsSchema,
        body: updateTaskBodySchema,
        response: { 200: envelopeSchema(taskSchema) },
      },
    },
    async (request, reply) => {
      const { id, tid } = request.params;
      reply.ok(await service.update(callerOf(request.user), id, tid, request.body));
    }
  );

  app.patch(
    "/v1/projects/:id/tasks/:tid/status",
    {
      preHandler: app.requirePermission(PERMISSIONS.taskUpdate),
      schema: {
        params: taskParamsSchema,
        body: statusBodySchema,
        response: { 200: envelopeSchema(taskSchema) },
      },
    },
    async (request, reply) => {
      const { id, tid } = request.params;
      reply.ok(await service.setStatus(callerOf(request.user), id, tid, request.body.status));
    }
  );

  app.delete(
    "/v1/projects/:id/tasks/:tid",
    {
      preHandler: manage,
      schema: { params: taskParamsSchema, response: { 200: envelopeSchema(z.null()) } },
    },
    async (request, reply) => {
      const { id, tid } = request.params;
      reply.ok(await service.remove(callerOf(request.user), id, tid));
    }
  );
};
