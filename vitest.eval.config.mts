import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// Prompt evals (*.eval.ts): real requests to the model, so they cost money.
// Run with `npm run eval`; wrap each suite in describe.skipIf(!getAiProvider()), with getAiProvider
// from "@/shared/ai", so the suites run with either ANTHROPIC_API_KEY or OPENROUTER_API_KEY.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./src/shared/testing/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.eval.ts", "tests/**/*.eval.ts"],
    environment: "node",
    env: { ...loadEnv("test", process.cwd(), ""), AI_MODE: "live" },
    testTimeout: 120_000,
  },
});
