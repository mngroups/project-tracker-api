import type { FastifyInstance } from "fastify";

/**
 * Placeholder env for generating the spec: nothing connects, and `credentials`
 * mode documents the login route (sso apps get authorize-url/callback instead).
 */
export const OPENAPI_ENV = {
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  DATABASE_URL: "postgres://openapi:openapi@127.0.0.1:5432/openapi",
  AUTH_MODE: "credentials",
  AUTH_ISSUER: "http://127.0.0.1:9000",
  AUTH_CLIENT_ID: "openapi",
  AUTH_CLIENT_SECRET: "openapi",
  S3_BUCKET: "openapi",
  S3_REGION: "us-east-1",
} satisfies NodeJS.ProcessEnv;

/** The OpenAPI document `@fastify/swagger` built from every route's Zod schemas. */
export async function generateOpenApi(app: FastifyInstance): Promise<object> {
  await app.ready();
  return app.swagger();
}
