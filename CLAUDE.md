# Monexa API: agent guide

Fastify 5 backend on `@mono/server-kit` (read its README for the plugin options). ESM, TypeScript (NodeNext), Node 24, pnpm 10.33.0. Postgres via Drizzle. See `README.md` for setup.

## Commands

| Command              | What it does                                         |
| -------------------- | ---------------------------------------------------- |
| `pnpm test:coverage` | Vitest with PGlite (no Docker). **100%** enforced    |
| `pnpm typecheck`     | `tsc --noEmit`                                       |
| `pnpm lint`          | Biome                                                |
| `pnpm db:generate`   | New migration from `src/db/schema/`                  |
| `pnpm openapi`       | Regenerate `openapi/openapi.json` (a test checks it) |

## Rules

- New features copy `src/features/examples`: routes → service → repository.
  - Services never import Fastify. Repositories hold queries only. A test enforces this.
- Every route declares Zod request **and** response schemas.
- Handlers call `reply.ok(...)` and never `return reply.ok(...)` (it's a type error with a response schema). Expected failures throw the kit's `AppError` with Indonesian copy.
- Never re-implement what the kit owns:
  - envelope;
  - status mapping (401/403/422/503);
  - auth;
  - RBAC.

  Guard routes with `app.requirePermission(PERMISSIONS.x)`, adding the string to `src/permissions.ts` first.
- No in-memory state across requests and no timers or background jobs. The same code runs on Vercel Functions.
- Migrations never run at boot. Never edit `src/db/migrations` by hand.
- Private registry auth lives only in `scripts/write-npmrc.sh`. Never hard-code GitLab project IDs or tokens.
- Keep the `// #region handbook:*` markers. The Monexa handbook embeds them.
