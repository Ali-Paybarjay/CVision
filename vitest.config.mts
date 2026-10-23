import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests, plus database tests on an in-memory Postgres (supabase/tests). They never call the real model;
// prompt evals have their own config.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./src/shared/testing/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}", "supabase/**/*.test.ts"],
    environment: "node",
    env: { AI_MODE: "mock" },
    // No fetch beyond this computer and no API key in unit tests. Not in vitest.eval.config.mts.
    setupFiles: ["./src/shared/testing/no-network.ts"],
  },
});
