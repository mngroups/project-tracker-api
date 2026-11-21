import { existsSync, readFileSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const config = JSON.parse(readFileSync(new URL("vercel.json", root), "utf8"));

describe("vercel.json", () => {
  it("serves only an empty public dir as static output, so the repo root is never public", () => {
    expect(config.outputDirectory).toBe("public");
    expect(existsSync(new URL("public/.gitkeep", root))).toBe(true);
  });

  it("writes the token-bearing .npmrc outside the deployed directory", () => {
    expect(config.installCommand).toContain("NPMRC_PATH=/tmp/.npmrc");
    expect(config.installCommand).toContain("NPM_CONFIG_USERCONFIG=/tmp/.npmrc");
  });
});
