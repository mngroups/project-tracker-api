FROM node:24.22.1-bookworm AS builder
WORKDIR /app
RUN corepack enable
ENV HUSKY=0

COPY package.json pnpm-lock.yaml ./
COPY scripts/write-npmrc.sh ./scripts/write-npmrc.sh

# The GitLab npm token (read_package_registry) comes in as a build secret and is
# deleted in the same layer, so it never ends up in the image:
#   docker build --secret id=gitlab_npm_token,env=GITLAB_NPM_TOKEN \
#     --build-arg GITLAB_PACKAGE_GROUP_ID=... .
ARG GITLAB_PACKAGE_GROUP_ID
RUN --mount=type=secret,id=gitlab_npm_token \
    GITLAB_NPM_TOKEN="$(tr -d '\n' < /run/secrets/gitlab_npm_token)" \
    GITLAB_PACKAGE_GROUP_ID="$GITLAB_PACKAGE_GROUP_ID" \
    sh scripts/write-npmrc.sh && \
    pnpm install --frozen-lockfile && \
    rm -f .npmrc

COPY . .
RUN pnpm build && pnpm prune --prod --ignore-scripts

FROM node:24.22.1-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Runtime config comes from the container env (see .env.example).
# Release step before rollout: docker run --rm --env-file .env <image> node dist/db/migrate.js
EXPOSE 8080
USER node
CMD ["node", "dist/server.js"]
