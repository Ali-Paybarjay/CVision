import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests only. They never call the real model; prompt evals have their own config.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    environment: "node",
    env: { AI_MODE: "mock" },
  },
});
