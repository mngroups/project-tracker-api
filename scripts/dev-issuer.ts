// `pnpm dev:issuer`: a local stand-in for the central auth service on :9000.
// Users, permissions and clients live in dev/issuer.json.
import { readFileSync } from "node:fs";
import { createDevIssuer } from "@mono/server-kit/dev";

const config = JSON.parse(readFileSync(new URL("../dev/issuer.json", import.meta.url), "utf8"));
const port = Number(process.env.DEV_ISSUER_PORT ?? 9000);
const issuer = await createDevIssuer({ issuer: `http://localhost:${port}`, ...config });
await issuer.listen({ port, host: "127.0.0.1" });
console.log(
  `dev issuer on http://localhost:${port} (users: pm/pm123, member/member123, client/client123)`
);
