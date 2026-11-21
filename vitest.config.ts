import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["{src,api,scripts}/**/__tests__/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "dist/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov", "json-summary"],
      include: ["src/**/*.ts", "api/**/*.ts"],
      exclude: ["**/__tests__/**", "src/server.ts", "src/db/migrate.ts", "src/db/migrations/**"],
      thresholds: { lines: 100, statements: 100, functions: 100, branches: 100 },
    },
  },
});
