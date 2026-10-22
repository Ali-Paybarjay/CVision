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
  },
});
