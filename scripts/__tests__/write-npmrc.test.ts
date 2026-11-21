import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const script = new URL("../write-npmrc.sh", import.meta.url).pathname;

function run(env: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "npmrc-"));
  const lock = join(dir, "pnpm-lock.yaml");
  writeFileSync(
    lock,
    [
      "  a: {tarball: https://gitlab.com/api/v4/projects/111/packages/npm/@mono/a/-/a-1.tgz}",
      "  b: {tarball: https://gitlab.com/api/v4/projects/222/packages/npm/@mono/b/-/b-1.tgz}",
      "  c: {tarball: https://gitlab.com/api/v4/projects/111/packages/npm/@mono/c/-/c-1.tgz}",
    ].join("\n")
  );
  const out = join(dir, ".npmrc");
  execFileSync("sh", [script], {
    env: { PATH: process.env.PATH, LOCKFILE: lock, NPMRC_PATH: out, ...env },
    stdio: "pipe",
  });
  return readFileSync(out, "utf8");
}

describe("write-npmrc.sh", () => {
  it("writes the group registry and one token line per lockfile project", () => {
    const npmrc = run({ GITLAB_NPM_TOKEN: "tok", GITLAB_PACKAGE_GROUP_ID: "42" });
    expect(npmrc.split("\n").filter(Boolean)).toEqual([
      "@mono:registry=https://gitlab.com/api/v4/groups/42/-/packages/npm/",
      "//gitlab.com/api/v4/groups/42/-/packages/npm/:_authToken=tok",
      "//gitlab.com/api/v4/projects/111/packages/npm/:_authToken=tok",
      "//gitlab.com/api/v4/projects/222/packages/npm/:_authToken=tok",
    ]);
  });

  it("fails naming the missing token", () => {
    let stderr = "";
    try {
      run({ GITLAB_PACKAGE_GROUP_ID: "42" });
    } catch (error) {
      stderr = String((error as { stderr: Buffer }).stderr);
    }
    expect(stderr).toContain("GITLAB_NPM_TOKEN");
  });
});
