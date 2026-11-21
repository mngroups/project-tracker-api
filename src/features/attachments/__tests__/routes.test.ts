import { presignResponseSchema } from "@mono/auth";
import { MESSAGES } from "@mono/server-kit";
import type { DevIssuer } from "@mono/server-kit/dev";
import type { FastifyInstance } from "fastify";
import { bearer, okDb, startTestIssuer, testEnv, tokenFor } from "../../../__tests__/helpers.js";
import { buildApp } from "../../../app.js";

let issuer: DevIssuer;
let app: FastifyInstance;
let token: string;

beforeAll(async () => {
  issuer = await startTestIssuer();
  token = await tokenFor(issuer, []);
  app = await buildApp({
    env: testEnv(issuer.issuer(), {
      S3_ENDPOINT: "http://localhost:9002",
      S3_FORCE_PATH_STYLE: "true",
      UPLOAD_MAX_BYTES: "1000",
      UPLOAD_ALLOWED_TYPES: "application/pdf",
    }),
    db: okDb as never,
  });
});
afterAll(async () => {
  await app.close();
  await issuer.app.close();
});

const presign = (
  payload: Record<string, unknown>,
  headers: Record<string, string> = bearer(token)
) => app.inject({ method: "POST", url: "/v1/attachments/presign", headers, payload });

describe("POST /v1/attachments/presign", () => {
  it("returns a presigned POST the FE can parse", async () => {
    const res = await presign({
      filename: "laporan.pdf",
      content_type: "application/pdf",
      size: 500,
    });
    expect(res.statusCode).toBe(200);
    const data = presignResponseSchema.parse(res.json().data);
    expect(data.s3_key).toMatch(/^uploads\/[0-9a-f-]{36}\/laporan\.pdf$/);
    expect(data.presign_url).toBe("http://localhost:9002/monexa-test");
  });

  it("enforces the configured size and type limits", async () => {
    const big = await presign({ filename: "a.pdf", content_type: "application/pdf", size: 1001 });
    expect(big.statusCode).toBe(422);
    expect(big.json().message).toBe(MESSAGES.fileTooLarge);
    const type = await presign({ filename: "a.png", content_type: "image/png", size: 10 });
    expect(type.statusCode).toBe(422);
    expect(type.json().message).toBe(MESSAGES.fileTypeNotAllowed);
  });

  it("validates the body and requires a token", async () => {
    expect(
      (await presign({ filename: "", content_type: "application/pdf", size: 1 })).statusCode
    ).toBe(422);
    expect(
      (await presign({ filename: "a.pdf", content_type: "application/pdf", size: 0 })).statusCode
    ).toBe(422);
    expect(
      (await presign({ filename: "a.pdf", content_type: "application/pdf", size: 1 }, {}))
        .statusCode
    ).toBe(401);
  });

  it("uses an injected presigner when given one", async () => {
    const custom = await buildApp({
      env: testEnv(issuer.issuer()),
      db: okDb as never,
      presigner: {
        presign: async () => ({ upload_uuid: "u-1", presign_url: "http://s3/x" }),
      } as never,
    });
    const res = await custom.inject({
      method: "POST",
      url: "/v1/attachments/presign",
      headers: bearer(token),
      payload: { filename: "a.pdf", content_type: "application/pdf", size: 1 },
    });
    expect(res.json().data).toMatchObject({ upload_uuid: "u-1" });
    await custom.close();
  });

  it("falls back to the AWS credential chain when no static keys are set", async () => {
    const env = testEnv(issuer.issuer());
    const chain = await buildApp({
      env: { ...env, S3_ACCESS_KEY_ID: undefined, S3_SECRET_ACCESS_KEY: undefined },
      db: okDb as never,
    });
    expect(chain.hasRoute({ method: "POST", url: "/v1/attachments/presign" })).toBe(true);
    await chain.close();
  });
});
