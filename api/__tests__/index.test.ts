import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { OPENAPI_ENV } from "../../src/openapi.js";

const built = vi.hoisted(() => ({ count: 0 }));

vi.mock("../../src/db/client.js", () => ({
  createDb: () => ({ db: { execute: async () => undefined }, close: async () => {} }),
}));
vi.mock("../../src/app.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/app.js")>();
  return {
    ...actual,
    buildApp: async (...args: Parameters<typeof actual.buildApp>) => {
      built.count += 1;
      return actual.buildApp(...args);
    },
  };
});

let server: Server;
let base: string;

beforeAll(async () => {
  Object.assign(process.env, OPENAPI_ENV);
  const { default: handler } = await import("../index.js");
  server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe("Vercel handler", () => {
  it("serves the app and builds it once per instance", async () => {
    const first = await fetch(`${base}/health`);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ success: true, data: { status: "ok" } });
    const second = await fetch(`${base}/v1/auth/check`);
    expect(second.status).toBe(401);
    expect(built.count).toBe(1);
  });
});
