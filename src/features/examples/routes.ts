import { envelopeSchema } from "@mono/server-kit";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { PERMISSIONS } from "../../permissions.js";
import {
  createBodySchema,
  exampleItemSchema,
  exampleListSchema,
  listQuerySchema,
} from "./schema.js";
import type { ExamplesService } from "./service.js";

// #region handbook:feature-layering
/** HTTP only: validate, authorize, call the service, reply with the envelope. */
export const exampleRoutes: FastifyPluginAsyncZod<{ service: ExamplesService }> = async (
  app,
  { service }
) => {
  app.get(
    "/v1/examples",
    {
      preHandler: app.requirePermission(PERMISSIONS.exampleView),
      schema: {
        querystring: listQuerySchema,
        response: { 200: envelopeSchema(exampleListSchema) },
      },
    },
    async (request, reply) => {
      reply.ok(await service.list(request.query));
    }
  );

  app.post(
    "/v1/examples",
    {
      preHandler: app.requirePermission(PERMISSIONS.exampleCreate),
      schema: { body: createBodySchema, response: { 201: envelopeSchema(exampleItemSchema) } },
    },
    async (request, reply) => {
      reply.ok(await service.create(request.body), { code: 201, message: "Data berhasil dibuat" });
    }
  );
};
// #endregion
