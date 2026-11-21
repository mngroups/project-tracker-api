import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // PGlite migrations per test file are slow under parallel load.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    include: ["{src,api,scripts}/**/__tests__/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "dist/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov", "json-summary"],
      include: ["src/**/*.ts", "api/**/*.ts"],
      exclude: ["**/__tests__/**", "src/server.ts", "src/db/migrate.ts", "src/db/migrations/**"],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 80 },
    },
  },
});
