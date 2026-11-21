# Project Tracker API

The backend of the Project Tracker app, built from `monexa-api-template`. It pairs with the Next.js frontend in `project-tracker`. The stack is Fastify 5 on [`@mono/server-kit`](../mono-server-kit), with:
- central OIDC auth, RBAC and the response envelope;
- PostgreSQL + Drizzle;
- Zod schemas as the single source for validation, serialization and OpenAPI;
- Vitest with 100% coverage enforced;
- Docker **or** Vercel deployment, chosen per app.

## Quick start

Registry access is the same as in the FE template:
- Set `export GITLAB_PACKAGE_GROUP_ID="123456"` in your shell profile.
- Create a personal GitLab token with `read_package_registry`.
  - On macOS, save it in Keychain Access as a password item named `monexa-gitlab-npm`, with the username from `id -un` as the account.
  - Elsewhere, provide it as `GITLAB_NPM_TOKEN`.
- `pnpm registry:run <args>` runs pnpm with a temporary npm config that is deleted when pnpm exits. Never commit a token or a generated `.npmrc`.

```bash
pnpm registry:run install    # or: pnpm registry:run add <pkg>
docker compose up -d         # Postgres :5432, MinIO :9002 (console :9003), bucket monexa-dev
pnpm dev:issuer              # stand-in for the central auth service on :9000
cp .env.example .env
pnpm db:migrate
pnpm dev                     # http://localhost:8080
```

To run it with the FE template, set `API_BASE_URL=http://localhost:8080` in its `.env` and client `project-tracker`, log in as `pm` / `pm123` (Project Manager, `project:all`), `member` / `member123` (Team Member) or `client` / `client123` (Client). All belong to the dev org "PT Contoh Klien". Edit `dev/issuer.json` to add users or permissions.

## Tenancy

Every table has `org_id` and every query filters by the token's `org_id` (see `src/auth-context.ts`). A token without an org gets 403.

## New app from this template

1. Copy the repo and rename `name` in `package.json`.
2. Register a client for the app in the central auth service and grant its permissions there.
3. Set the env vars below, then add your features under `src/features/`.

## Adding a feature

Follow the layering below:

| File            | Holds                                                            |
| --------------- | ---------------------------------------------------------------- |
| `schema.ts`     | Zod request/response schemas, the single source of truth         |
| `repository.ts` | Drizzle queries only                                             |
| `service.ts`    | Business logic. No Fastify, no SQL                               |
| `routes.ts`     | Validate, `requirePermission`, call the service, `reply.ok(...)` |

Then:
1. Add the table to `src/db/schema/` and run `pnpm db:generate`.
2. Add the permission strings to `src/permissions.ts`.
3. Register the routes in `src/app.ts`.
4. Run `pnpm openapi`. A test fails while `openapi/openapi.json` is stale.

In routes that have a response schema, **call** `reply.ok(...)` and don't `return` it.

## Environment

| Variable                                              | Default                                | Notes                                                                                                                                                                                                |
| ----------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                                                | `8080`                                 |                                                                                                                                                                                                      |
| `LOG_LEVEL`                                           | `info`                                 |                                                                                                                                                                                                      |
| `DATABASE_URL`                                        | required                               | On Vercel, use a pooler (PgBouncer transaction mode or the provider's pooler)                                                                                                                        |
| `DB_POOL_MAX`                                         | `10`                                   | Use 1–3 on Vercel                                                                                                                                                                                    |
| `AUTH_MODE`                                           | required                               | `credentials` or `sso`                                                                                                                                                                               |
| `AUTH_ISSUER`, `AUTH_CLIENT_ID`, `AUTH_CLIENT_SECRET` | required                               | The central OIDC client for this app                                                                                                                                                                 |
| `AUTH_REDIRECT_URIS`                                  | –                                      | `sso`: comma-separated FE callback URLs                                                                                                                                                              |
| `AUTH_IDP_HINT`                                       | –                                      | `sso`: e.g. `google`                                                                                                                                                                                 |
| `AUTH_POST_LOGOUT_REDIRECT_URI`                       | –                                      | `sso`: where global logout returns to                                                                                                                                                                |
| `CORS_ORIGINS`                                        | –                                      | Comma-separated. Leave empty for no CORS, since the FE calls this API from the server                                                                                                                |
| `RATE_LIMIT_MAX` / `LOGIN_RATE_LIMIT_MAX`             | `300` / `10`                           | Per minute. Keyed by user when authenticated, by username on `/v1/auth/login`, and by client IP otherwise. The login limit also covers `/v1/auth/callback`. `/health` and `/ready` are never limited |
| `TRUST_PROXY`                                         | `false`                                | Set to `true` behind a proxy that sets `X-Forwarded-For` (load balancer, Vercel), so anonymous limits use the real client IP                                                                         |
| `S3_BUCKET`, `S3_REGION`                              | required                               |                                                                                                                                                                                                      |
| `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE`                  | – / `false`                            | For S3-compatible storage such as MinIO                                                                                                                                                              |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`            | –                                      | Set both or neither. With neither, the AWS credential chain is used                                                                                                                                  |
| `UPLOAD_MAX_BYTES`, `UPLOAD_ALLOWED_TYPES`            | `26214400`, PDF/images/Office/zip/text | Limits for presigned uploads                                                                                                                                                                         |

An empty value counts as unset. A bad env fails at boot, and the error names the keys but never their values.

## Auth modes

| App needs             | `AUTH_MODE`   | `AUTH_IDP_HINT` | Central service config                                                 |
| --------------------- | ------------- | --------------- | ---------------------------------------------------------------------- |
| In-app login form     | `credentials` | –               | –                                                                      |
| Monexa single sign-on | `sso`         | –               | Client registered with the FE callback URL                             |
| Google login required | `sso`         | `google`        | Client accepts only the Google IdP (and optionally a Workspace domain) |

Permissions come from the token's `permissions` claim, which the central service manages per client. A change takes effect at the next token refresh.

## Deployment

- **Vercel:** Git integration, with a preview per branch and production on `main`. `vercel.json` writes `.npmrc` to `/tmp` through `scripts/write-npmrc.sh` (never into the deployed directory), serves only the empty `public/` as static files, and routes everything else to `api/index.ts`. Set `GITLAB_NPM_TOKEN` and `GITLAB_PACKAGE_GROUP_ID` in Vercel, and put the function region next to the database.
  - **Migrations** run in the build (`scripts/vercel-build.sh`), but **only for production**. Previews skip them, because a preview would otherwise apply an unreviewed branch's migrations to the Preview database, which is often the production one.
  - Set `MIGRATE_ON_PREVIEW=true` only when previews have their own database.
  - Set `MIGRATION_DATABASE_URL` to a direct connection when `DATABASE_URL` points at a transaction pooler.
- **Docker:**

  ```bash
  docker build --secret id=gitlab_npm_token,env=GITLAB_NPM_TOKEN --build-arg GITLAB_PACKAGE_GROUP_ID=... -t api .
  ```

  Run migrations as a release step before rollout: `node dist/db/migrate.js` in the image, or the **Migrate** GitHub workflow. Then start the container.

Use Vercel for small, internal or bursty apps. Use Docker for steady high traffic, long requests, or when you need workers.

Migrations never run at boot.

## Scripts

`registry:run`, `dev`, `dev:issuer`, `build`, `start`, `db:generate`, `db:migrate`, `db:studio`, `openapi`, `lint`, `typecheck`, `test:coverage`.
