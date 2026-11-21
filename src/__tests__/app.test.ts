import type { DevIssuer } from "@mono/server-kit/dev";
import type { FastifyInstance } from "fastify";
import { buildApp, MESSAGES_APP } from "../app.js";
import { PERMISSIONS } from "../permissions.js";
import { bearer, okDb, startTestIssuer, testEnv, tokenFor } from "./helpers.js";

let issuer: DevIssuer;
const apps: FastifyInstance[] = [];

async function app(overrides: Record<string, string> = {}) {
  const instance = await buildApp({ env: testEnv(issuer.issuer(), overrides), db: okDb as never });
  apps.push(instance);
  return instance;
}

beforeAll(async () => {
  issuer = await startTestIssuer();
});
afterAll(async () => {
  await Promise.all(apps.map((a) => a.close()));
  await issuer.app.close();
});

describe("buildApp", () => {
  it("serves health and envelope 404s", async () => {
    const a = await app();
    const health = await a.inject({ url: "/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({ success: true, data: { status: "ok" } });
    const ready = await a.inject({ url: "/ready" });
    expect(ready.json().data).toEqual({ checks: { db: "ok" } });
    const missing = await a.inject({ url: "/nope" });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ success: false, code: 404 });
  });

  it("guards routes with the central auth plugin", async () => {
    const a = await app();
    expect((await a.inject({ url: "/v1/auth/check" })).statusCode).toBe(401);
    const token = await tokenFor(issuer, ["example:all"]);
    const res = await a.inject({ url: "/v1/auth/check", headers: bearer(token) });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ user_id: "user-1", permissions: ["example:all"] });
  });

  it("proxies credentials login to the issuer", async () => {
    const a = await app();
    const res = await a.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { username: "admin", password: "admin123" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.access_token).toEqual(expect.any(String));
  });

  it("maps sso env into the auth plugin", async () => {
    const a = await app({
      AUTH_MODE: "sso",
      AUTH_REDIRECT_URIS: "http://localhost:3000/auth/callback",
      AUTH_IDP_HINT: "google",
      AUTH_POST_LOGOUT_REDIRECT_URI: "http://localhost:3000/login",
    });
    const res = await a.inject({
      url: `/v1/auth/authorize-url?redirect_uri=${encodeURIComponent("http://localhost:3000/auth/callback")}`,
    });
    expect(res.statusCode).toBe(200);
    expect(new URL(res.json().data.url).searchParams.get("kc_idp_hint")).toBe("google");
    const out = await a.inject({ method: "POST", url: "/v1/auth/logout" });
    expect(
      new URL(out.json().data.end_session_url).searchParams.get("post_logout_redirect_uri")
    ).toBe("http://localhost:3000/login");
  });

  it("sends security headers", async () => {
    const res = await (await app()).inject({ url: "/health" });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("enables CORS only for configured origins", async () => {
    const preflight = {
      method: "OPTIONS" as const,
      url: "/health",
      headers: { origin: "http://localhost:3000", "access-control-request-method": "GET" },
    };
    const allowed = await (await app({ CORS_ORIGINS: "http://localhost:3000" })).inject(preflight);
    expect(allowed.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    const none = await (await app()).inject(preflight);
    expect(none.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("rate-limits login more tightly, with an Indonesian envelope", async () => {
    const a = await app({ LOGIN_RATE_LIMIT_MAX: "2" });
    const login = () =>
      a.inject({
        method: "POST",
        url: "/v1/auth/login",
        payload: { username: "admin", password: "admin123" },
      });
    await login();
    await login();
    const third = await login();
    expect(third.statusCode).toBe(429);
    expect(third.json()).toMatchObject({
      success: false,
      code: 429,
      message: MESSAGES_APP.rateLimited,
      data: null,
    });
    // Other routes keep the global limit.
    expect(
      (await a.inject({ method: "POST", url: "/v1/auth/refresh", payload: { refresh_token: "x" } }))
        .statusCode
    ).not.toBe(429);
  });

  it("applies the global rate limit to anonymous routes", async () => {
    const a = await app({ RATE_LIMIT_MAX: "2" });
    const refresh = () =>
      a.inject({ method: "POST", url: "/v1/auth/refresh", payload: { refresh_token: "x" } });
    await refresh();
    await refresh();
    expect((await refresh()).statusCode).toBe(429);
  });

  it("keys login limits per username, not per (shared) FE server address", async () => {
    const a = await app({ LOGIN_RATE_LIMIT_MAX: "1" });
    const login = (username: string) =>
      a.inject({ method: "POST", url: "/v1/auth/login", payload: { username, password: "x" } });
    await login("admin");
    expect((await login("Admin")).statusCode).toBe(429);
    expect((await login("viewer")).statusCode).not.toBe(429);
  });

  it("keys authenticated requests per user", async () => {
    const a = await app({ RATE_LIMIT_MAX: "1" });
    const one = await issuer.signTestToken({ sub: "u-1", aud: "monexa-app", permissions: [] });
    const two = await issuer.signTestToken({ sub: "u-2", aud: "monexa-app", permissions: [] });
    expect((await a.inject({ url: "/v1/auth/check", headers: bearer(one) })).statusCode).toBe(200);
    expect((await a.inject({ url: "/v1/auth/check", headers: bearer(one) })).statusCode).toBe(429);
    expect((await a.inject({ url: "/v1/auth/check", headers: bearer(two) })).statusCode).toBe(200);
  });

  it("never rate-limits health and readiness probes", async () => {
    const a = await app({ RATE_LIMIT_MAX: "1" });
    for (let i = 0; i < 3; i += 1) {
      expect((await a.inject({ url: "/health" })).statusCode).toBe(200);
      expect((await a.inject({ url: "/ready" })).statusCode).toBe(200);
    }
  });

  it("uses X-Forwarded-For for anonymous requests only when TRUST_PROXY is on", async () => {
    const refresh = (a: FastifyInstance, ip: string) =>
      a.inject({
        method: "POST",
        url: "/v1/auth/refresh",
        headers: { "x-forwarded-for": ip },
        payload: { refresh_token: "nope" },
      });
    const trusted = await app({ RATE_LIMIT_MAX: "1", TRUST_PROXY: "true" });
    await refresh(trusted, "203.0.113.1");
    expect((await refresh(trusted, "203.0.113.2")).statusCode).not.toBe(429);
    const untrusted = await app({ RATE_LIMIT_MAX: "1" });
    await refresh(untrusted, "203.0.113.1");
    expect((await refresh(untrusted, "203.0.113.2")).statusCode).toBe(429);
  });

  it("exposes the app's permission catalog", () => {
    expect(PERMISSIONS).toEqual({
      exampleView: "example.item:view",
      exampleCreate: "example.item:create",
    });
  });
});
