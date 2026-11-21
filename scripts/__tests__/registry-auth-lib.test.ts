import { describe, expect, it } from "vitest";

import {
  normalizeGroupId,
  renderRegistryConfig,
  validateRegistryCredentials,
} from "../registry-auth-lib.mjs";

describe("validateRegistryCredentials", () => {
  it("normalizes a numeric group ID", () => {
    expect(normalizeGroupId(" 123 ")).toBe("123");
  });

  it("normalizes a valid group ID and token", () => {
    expect(validateRegistryCredentials({ groupId: " 123 ", token: " token-value " })).toEqual({
      groupId: "123",
      token: "token-value",
    });
  });

  it("rejects missing or invalid group IDs", () => {
    expect(() => validateRegistryCredentials({ groupId: undefined, token: "token" })).toThrow(
      /numeric GitLab group ID/
    );
    expect(() => validateRegistryCredentials({ groupId: "group", token: "token" })).toThrow(
      /numeric GitLab group ID/
    );
  });

  it("rejects missing, empty, or multiline tokens", () => {
    expect(() => validateRegistryCredentials({ groupId: "123", token: undefined })).toThrow(
      /non-empty GitLab npm token/
    );
    expect(() => validateRegistryCredentials({ groupId: "123", token: " " })).toThrow(
      /non-empty GitLab npm token/
    );
    expect(() => validateRegistryCredentials({ groupId: "123", token: "token\nvalue" })).toThrow(
      /must not contain line breaks/
    );
  });
});

describe("renderRegistryConfig", () => {
  it("substitutes registry variables without altering token replacement characters", () => {
    const config = renderRegistryConfig(
      [
        "@mono:registry=https://gitlab.com/api/v4/groups/${GITLAB_PACKAGE_GROUP_ID}/-/packages/npm/",
        "_auth=${GITLAB_NPM_TOKEN}",
        "",
      ].join("\n"),
      { groupId: "123", token: "$&-token" }
    );

    expect(config).toBe(
      [
        "@mono:registry=https://gitlab.com/api/v4/groups/123/-/packages/npm/",
        "_auth=$&-token",
        "",
      ].join("\n")
    );
  });

  it("rejects unresolved GitLab variables", () => {
    expect(() =>
      renderRegistryConfig("value=${GITLAB_UNKNOWN}", { groupId: "123", token: "token" })
    ).toThrow(/unresolved GitLab variable/);
  });
});

describe(".npmrc.example", () => {
  it("authenticates the group registry and every GitLab project tarball URL", async () => {
    const { readFileSync } = await import("node:fs");
    const template = readFileSync(new URL("../../.npmrc.example", import.meta.url), "utf8");
    const config = renderRegistryConfig(template, { groupId: "42", token: "tok" });
    expect(config).toContain("@mono:registry=https://gitlab.com/api/v4/groups/42/-/packages/npm/");
    // Tarballs resolve from each package's project registry (projects/<id>/…); pnpm matches
    // auth by path prefix, so this one line covers every @mono project.
    expect(config).toContain("//gitlab.com/api/v4/:_authToken=tok");
  });
});
