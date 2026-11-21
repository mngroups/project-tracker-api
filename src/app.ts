import { readFileSync } from "node:fs";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import {
  AppError,
  auth,
  createPresigner,
  createServerOptions,
  envelope,
  errorHandler,
  health,
  requestId,
} from "@mono/server-kit";
import { sql } from "drizzle-orm";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import type { Db } from "./db/client.js";
import type { Env } from "./env.js";
import { attachmentRoutes } from "./features/attachments/routes.js";
import { createProjectsRepository } from "./features/projects/repository.js";
import { projectRoutes } from "./features/projects/routes.js";
import { createProjectsService } from "./features/projects/service.js";

/** App copy that complements the kit's `MESSAGES`. */
export const MESSAGES_APP = {
  rateLimited: "Terlalu banyak permintaan, coba lagi nanti",
} as const;

export type Presigner = ReturnType<typeof createPresigner>;

export type BuildAppOptions = {
  env: Env;
  db: Db;
  closeDb?: () => Promise<void>;
  presigner?: Presigner;
};

function presignerFromEnv(env: Env): Presigner {
  const { S3_ACCESS_KEY_ID: accessKeyId, S3_SECRET_ACCESS_KEY: secretAccessKey } = env;
  return createPresigner({
    bucket: env.S3_BUCKET,
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    // Without static keys the AWS SDK credential chain applies (IAM role, env, profile).
    credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
  });
}

const { version } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
) as { version: string };

const STRICT_RATE_LIMIT_ROUTES = new Set(["/v1/auth/login", "/v1/auth/callback"]);
const PROBE_ROUTES = new Set(["/health", "/ready"]);

/**
 * The FE calls this API from its server, so every request shares one peer address.
 * Key by user when authenticated, by username on login (brute-force protection per
 * account), and by client IP otherwise (real only with TRUST_PROXY behind a proxy).
 */
function rateLimitKey(request: FastifyRequest): string {
  if (request.user) return `user:${request.user.id}`;
  const username = (request.body as { username?: unknown } | undefined)?.username;
  if (request.routeOptions.url === "/v1/auth/login" && typeof username === "string") {
    return `login:${username.trim().toLowerCase()}`;
  }
  return `ip:${request.ip}`;
}

/** Builds the app without listening; `src/server.ts` (Docker) and `api/index.ts` (Vercel) share it. */
export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const { env } = opts;
  const app = Fastify({
    ...createServerOptions({ logLevel: env.LOG_LEVEL }),
    trustProxy: env.TRUST_PROXY,
  });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // #region handbook:app-wiring
  // Registered first so it sees every route (`pnpm openapi` writes the spec).
  await app.register(swagger, {
    openapi: { info: { title: "Project Tracker API", version } },
    transform: jsonSchemaTransform,
  });
  await app.register(requestId);
  await app.register(envelope);
  await app.register(errorHandler);
  await app.register(helmet);
  if (env.CORS_ORIGINS.length > 0) await app.register(cors, { origin: env.CORS_ORIGINS });

  // Must run before rate-limit's own onRoute hook reads `config.rateLimit`.
  app.addHook("onRoute", (route) => {
    if (STRICT_RATE_LIMIT_ROUTES.has(route.url)) {
      route.config = {
        ...route.config,
        rateLimit: { max: env.LOGIN_RATE_LIMIT_MAX, timeWindow: "1 minute" },
      };
    }
    // Probes must never be throttled: a 429 on /ready takes the instance out of rotation.
    if (PROBE_ROUTES.has(route.url)) route.config = { ...route.config, rateLimit: false };
  });
  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: "1 minute",
    // After auth (onRequest) and body parsing, so the key can be the user or the login name.
    hook: "preHandler",
    keyGenerator: rateLimitKey,
    errorResponseBuilder: () => new AppError(429, MESSAGES_APP.rateLimited),
  });

  await app.register(auth, {
    mode: env.AUTH_MODE,
    issuer: env.AUTH_ISSUER,
    clientId: env.AUTH_CLIENT_ID,
    clientSecret: env.AUTH_CLIENT_SECRET,
    redirectUris: env.AUTH_REDIRECT_URIS,
    idpHint: env.AUTH_IDP_HINT,
    postLogoutRedirectUri: env.AUTH_POST_LOGOUT_REDIRECT_URI,
  });
  await app.register(health, { checks: { db: () => opts.db.execute(sql`select 1`) } });
  // #endregion

  await app.register(attachmentRoutes, {
    presigner: opts.presigner ?? presignerFromEnv(env),
    maxBytes: env.UPLOAD_MAX_BYTES,
    allowedTypes: env.UPLOAD_ALLOWED_TYPES,
  });

  await app.register(projectRoutes, {
    service: createProjectsService(createProjectsRepository(opts.db)),
  });

  const { closeDb } = opts;
  if (closeDb) app.addHook("onClose", async () => closeDb());

  return app;
}
