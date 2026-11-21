import { createDevIssuer, type DevIssuer } from "@mono/server-kit/dev";
import { type Env, loadEnv } from "../env.js";

export const CLIENT_ID = "monexa-app";
export const CLIENT_SECRET = "dev-secret";
export const REDIRECT = "http://localhost:3000/auth/callback";

export async function startTestIssuer(): Promise<DevIssuer> {
  const issuer = await createDevIssuer({
    users: [
      {
        username: "admin",
        password: "admin123",
        sub: "user-1",
        permissions: { [CLIENT_ID]: ["example:all"] },
      },
    ],
    clients: [{ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, redirectUris: [REDIRECT] }],
  });
  await issuer.listen();
  return issuer;
}

export function testEnv(issuer: string, overrides: Record<string, string> = {}): Env {
  return loadEnv({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    DATABASE_URL: "postgres://monexa:monexa@127.0.0.1:1/monexa",
    AUTH_MODE: "credentials",
    AUTH_ISSUER: issuer,
    AUTH_CLIENT_ID: CLIENT_ID,
    AUTH_CLIENT_SECRET: CLIENT_SECRET,
    S3_BUCKET: "monexa-test",
    S3_REGION: "us-east-1",
    S3_ACCESS_KEY_ID: "test",
    S3_SECRET_ACCESS_KEY: "test-secret",
    ...overrides,
  });
}

export function tokenFor(issuer: DevIssuer, permissions: string[]): Promise<string> {
  return issuer.signTestToken({ sub: "user-1", aud: CLIENT_ID, permissions });
}

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

/** A database stand-in whose health query succeeds. */
export const okDb = { execute: async () => ({ rows: [] }) };
