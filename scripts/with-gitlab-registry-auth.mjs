#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeGroupId, renderRegistryConfig } from "./registry-auth-lib.mjs";

const KEYCHAIN_SERVICE = "monexa-gitlab-npm";
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function getToken() {
  if (process.env.GITLAB_NPM_TOKEN !== undefined) {
    return process.env.GITLAB_NPM_TOKEN;
  }

  if (process.platform !== "darwin") {
    throw new Error(
      "Set GITLAB_NPM_TOKEN from your password manager, or run this command on macOS " +
        "with the token saved in Keychain."
    );
  }

  try {
    return execFileSync(
      "security",
      ["find-generic-password", "-a", os.userInfo().username, "-s", KEYCHAIN_SERVICE, "-w"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    ).trim();
  } catch (error) {
    const account = os.userInfo().username;
    throw new Error(
      `Could not read the GitLab npm token from Keychain. Save it as a password item ` +
        `named "${KEYCHAIN_SERVICE}" for account "${account}".`,
      { cause: error }
    );
  }
}

async function main() {
  const groupId = normalizeGroupId(process.env.GITLAB_PACKAGE_GROUP_ID);
  const template = await readFile(path.join(PROJECT_ROOT, ".npmrc.example"), "utf8");
  const config = renderRegistryConfig(template, {
    groupId,
    token: getToken(),
  });
  const pnpmCli = process.env.npm_execpath;

  if (!pnpmCli) {
    throw new Error("Run this helper through pnpm, for example: pnpm registry:run install.");
  }

  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "monexa-npm-auth-"));
  const temporaryConfig = path.join(temporaryDirectory, ".npmrc");

  try {
    await writeFile(temporaryConfig, config, { encoding: "utf8", mode: 0o600 });

    const args = process.argv.slice(2);
    if (args[0] === "--") args.shift();

    const result = spawnSync(
      process.execPath,
      [pnpmCli, ...(args.length > 0 ? args : ["install"])],
      {
        env: { ...process.env, npm_config_userconfig: temporaryConfig },
        stdio: "inherit",
      }
    );

    if (result.error) {
      throw new Error("Could not start pnpm with the temporary registry configuration.", {
        cause: result.error,
      });
    }

    if (result.signal) {
      console.error(`pnpm was terminated by ${result.signal}.`);
      process.exitCode = 1;
      return;
    }

    process.exitCode = result.status ?? 1;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`Registry command failed: ${error.message}`);
  process.exitCode = 1;
});
