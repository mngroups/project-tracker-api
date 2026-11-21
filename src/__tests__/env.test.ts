import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { loadEnv } from "../env.js";

const minimal = {
  DATABASE_URL: "postgres://monexa:monexa@localhost:5432/monexa",
  AUTH_MODE: "credentials",
  AUTH_ISSUER: "http://localhost:9000",
  AUTH_CLIENT_ID: "monexa-app",
  AUTH_CLIENT_SECRET: "dev-secret",
  S3_BUCKET: "monexa-dev",
  S3_REGION: "us-east-1",
};

describe("loadEnv", () => {
  it("applies defaults to a minimal env", () => {
    const env = loadEnv(minimal);
    expect(env).toMatchObject({
      NODE_ENV: "development",
      PORT: 8080,
      LOG_LEVEL: "info",
      DB_POOL_MAX: 10,
      AUTH_REDIRECT_URIS: [],
      CORS_ORIGINS: [],
      RATE_LIMIT_MAX: 300,
      LOGIN_RATE_LIMIT_MAX: 10,
      TRUST_PROXY: false,
      S3_FORCE_PATH_STYLE: false,
      UPLOAD_MAX_BYTES: 26214400,
      UPLOAD_ALLOWED_TYPES: expect.arrayContaining(["application/pdf", "image/webp", "text/csv"]),
    });
  });

  it("trims list entries and drops empty ones", () => {
    const env = loadEnv({
      ...minimal,
      AUTH_REDIRECT_URIS: " http://a/cb , ,http://b/cb,",
      CORS_ORIGINS: "http://localhost:3000, ",
      UPLOAD_ALLOWED_TYPES: "image/png ,,",
    });
    expect(env.AUTH_REDIRECT_URIS).toEqual(["http://a/cb", "http://b/cb"]);
    expect(env.CORS_ORIGINS).toEqual(["http://localhost:3000"]);
    expect(env.UPLOAD_ALLOWED_TYPES).toEqual(["image/png"]);
  });

  it("parses booleans and numbers from strings", () => {
    const env = loadEnv({
      ...minimal,
      S3_FORCE_PATH_STYLE: "true",
      PORT: "3001",
      DB_POOL_MAX: "2",
    });
    expect(env).toMatchObject({ S3_FORCE_PATH_STYLE: true, PORT: 3001, DB_POOL_MAX: 2 });
  });

  it("requires S3 credentials as a pair", () => {
    expect(() => loadEnv({ ...minimal, S3_ACCESS_KEY_ID: "minio" })).toThrow(
      /S3_SECRET_ACCESS_KEY: /
    );
    expect(() => loadEnv({ ...minimal, S3_SECRET_ACCESS_KEY: "minio12345" })).toThrow(
      /S3_ACCESS_KEY_ID: /
    );
    expect(() =>
      loadEnv({ ...minimal, S3_ACCESS_KEY_ID: "minio", S3_SECRET_ACCESS_KEY: "minio12345" })
    ).not.toThrow();
  });

  it("names a missing variable without echoing any value", () => {
    const { DATABASE_URL: _omit, ...rest } = minimal;
    let message = "";
    try {
      loadEnv({ ...rest, AUTH_MODE: "magic" });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("DATABASE_URL");
    expect(message).toContain("AUTH_MODE");
    expect(message).not.toContain("dev-secret");
    expect(message).not.toContain("magic");
  });

  it("treats empty values as unset", () => {
    const env = loadEnv({ ...minimal, AUTH_IDP_HINT: "", PORT: "" });
    expect(env.AUTH_IDP_HINT).toBeUndefined();
    expect(env.PORT).toBe(8080);
  });

  it("accepts the committed .env.example", () => {
    const example = parseEnv(readFileSync(join(import.meta.dirname, "../../.env.example"), "utf8"));
    expect(() => loadEnv(example)).not.toThrow();
  });
});
