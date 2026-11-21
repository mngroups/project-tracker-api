import { defineEnv } from "@mono/server-kit";
import { z } from "zod";

/** Comma-separated list: entries trimmed, empty ones dropped. */
const list = (fallback: string[] = []) =>
  z
    .string()
    .optional()
    .transform((raw) =>
      raw === undefined
        ? fallback
        : raw
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean)
    );

const int = (fallback: number) => z.coerce.number().int().positive().default(fallback);

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: int(8080),
    LOG_LEVEL: z.string().default("info"),

    DATABASE_URL: z.url(),
    DB_POOL_MAX: int(10),

    AUTH_MODE: z.enum(["credentials", "sso"]),
    AUTH_ISSUER: z.url(),
    AUTH_CLIENT_ID: z.string().min(1),
    AUTH_CLIENT_SECRET: z.string().min(1),
    AUTH_REDIRECT_URIS: list(),
    AUTH_IDP_HINT: z.string().min(1).optional(),
    AUTH_POST_LOGOUT_REDIRECT_URI: z.url().optional(),

    CORS_ORIGINS: list(),
    // Behind a proxy that sets X-Forwarded-For (load balancer, Vercel), so `request.ip`
    // is the real client for anonymous rate limiting.
    TRUST_PROXY: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    RATE_LIMIT_MAX: int(300),
    LOGIN_RATE_LIMIT_MAX: int(10),

    S3_BUCKET: z.string().min(1),
    S3_REGION: z.string().min(1),
    S3_ENDPOINT: z.url().optional(),
    S3_FORCE_PATH_STYLE: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    UPLOAD_MAX_BYTES: int(10485760),
    UPLOAD_ALLOWED_TYPES: list(["application/pdf", "image/jpeg", "image/png"]),
  })
  .superRefine((env, ctx) => {
    if (Boolean(env.S3_ACCESS_KEY_ID) !== Boolean(env.S3_SECRET_ACCESS_KEY)) {
      ctx.addIssue({
        code: "custom",
        path: [env.S3_ACCESS_KEY_ID ? "S3_SECRET_ACCESS_KEY" : "S3_ACCESS_KEY_ID"],
        message: "S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be set together",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Parses `process.env` (or `source`) at boot; the error names keys, never values.
 * An empty value (`AUTH_IDP_HINT=`) counts as unset, as it does in most `.env` tooling.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const set = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ""));
  return defineEnv(envSchema, set);
}
