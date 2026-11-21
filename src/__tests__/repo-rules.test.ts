import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const src = join(import.meta.dirname, "..");

function files(dir: string, name: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return entry === "__tests__" ? [] : files(path, name);
    return entry === name ? [path] : [];
  });
}

describe("repo rules (see CLAUDE.md)", () => {
  it("services never import Fastify", () => {
    const offenders = files(join(src, "features"), "service.ts").filter((file) =>
      /(?:from|import)\s*"fastify[^"]*"/.test(readFileSync(file, "utf8"))
    );
    expect(offenders).toEqual([]);
  });

  it("every feature route declares a response schema", () => {
    for (const file of files(join(src, "features"), "routes.ts")) {
      const code = readFileSync(file, "utf8");
      const routes = code.match(/app\.(get|post|put|patch|delete)\(/g) ?? [];
      const responses = code.match(/response:/g) ?? [];
      expect(responses.length, file).toBeGreaterThanOrEqual(routes.length);
    }
  });

  it("keeps the handbook marker on the app wiring", () => {
    expect(readFileSync(join(src, "app.ts"), "utf8")).toContain("#region handbook:app-wiring");
  });
});
