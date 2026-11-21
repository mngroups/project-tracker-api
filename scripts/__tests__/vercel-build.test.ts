import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const script = new URL("../vercel-build.sh", import.meta.url).pathname;

/** Runs the build script with a fake `pnpm` that records each call and its DATABASE_URL. */
function run(env: Record<string, string>): string[] {
  const dir = mkdtempSync(join(tmpdir(), "vercel-build-"));
  const log = join(dir, "calls.log");
  const fake = join(dir, "pnpm");
  writeFileSync(fake, `#!/bin/sh\necho "$* db=\${DATABASE_URL:-}" >> "${log}"\n`);
  chmodSync(fake, 0o755);
  writeFileSync(log, "");
  execFileSync("sh", [script], {
    env: { PATH: `${dir}:${process.env.PATH}`, DATABASE_URL: "postgres://pooler/app", ...env },
    stdio: "pipe",
  });
  return readFileSync(log, "utf8").split("\n").filter(Boolean);
}

describe("vercel-build.sh", () => {
  it("migrates production deployments before building", () => {
    expect(run({ VERCEL_ENV: "production" })).toEqual([
      "db:migrate db=postgres://pooler/app",
      "build db=postgres://pooler/app",
    ]);
  });

  it("prefers a direct MIGRATION_DATABASE_URL for migrations", () => {
    const calls = run({
      VERCEL_ENV: "production",
      MIGRATION_DATABASE_URL: "postgres://direct/app",
    });
    expect(calls[0]).toBe("db:migrate db=postgres://direct/app");
  });

  it("never runs a branch's migrations on preview deployments unless opted in", () => {
    expect(run({ VERCEL_ENV: "preview" })).toEqual(["build db=postgres://pooler/app"]);
    expect(run({ VERCEL_ENV: "preview", MIGRATE_ON_PREVIEW: "true" })[0]).toMatch(/^db:migrate/);
  });
});
