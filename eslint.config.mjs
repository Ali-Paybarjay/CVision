import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Claude Code keeps other sessions' worktrees here, each with its own .next build.
    ".claude/**",
    // Playwright writes these when npm run test:e2e runs (both are git-ignored).
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
