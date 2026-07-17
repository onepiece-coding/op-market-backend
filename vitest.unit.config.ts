import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.unit.ts"],
    include: ["tests/unit/**/*.test.ts"],
    exclude: ["dist/**", "node_modules/**", "prisma/**", "src/generated/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/generated/**", "**/*.d.ts"],
    },
  },
});
