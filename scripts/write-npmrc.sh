#!/bin/sh
# Writes .npmrc for the private @mono packages (CI, Docker, Vercel).
# Token lines for each GitLab project registry are taken from pnpm-lock.yaml, so
# adding a @mono package never means editing this script.
set -eu
: "${GITLAB_NPM_TOKEN:?Set GITLAB_NPM_TOKEN (read_package_registry)}"
: "${GITLAB_PACKAGE_GROUP_ID:?Set GITLAB_PACKAGE_GROUP_ID}"
LOCK="${LOCKFILE:-pnpm-lock.yaml}"
OUT="${NPMRC_PATH:-.npmrc}"
{
  printf '@mono:registry=https://gitlab.com/api/v4/groups/%s/-/packages/npm/\n' "$GITLAB_PACKAGE_GROUP_ID"
  printf '//gitlab.com/api/v4/groups/%s/-/packages/npm/:_authToken=%s\n' "$GITLAB_PACKAGE_GROUP_ID" "$GITLAB_NPM_TOKEN"
  grep -o 'gitlab\.com/api/v4/projects/[0-9]*/packages/npm' "$LOCK" | sort -u | while read -r project; do
    printf '//%s/:_authToken=%s\n' "$project" "$GITLAB_NPM_TOKEN"
  done
} > "$OUT"
