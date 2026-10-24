import { defineConfig, devices } from "@playwright/test";

// The end-to-end test of the main path (tests/e2e): on a phone, with mock AI and sample data, no Supabase.
// Run it with `npm run test:e2e`; CI runs it only on main or on a PR labelled e2e (CLAUDE.md, rule 11).
const port = 3200;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "phone", use: { ...devices["Pixel 7"] } }],
  webServer: {
    // CI tests the production build. On a computer the dev server starts faster and is reused between runs.
    command: process.env.CI ? `npm run build && npm run start -- --port ${port}` : `npm run dev -- --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    // Sample data only, even on a computer whose .env.local holds real keys: Next.js never overrides
    // a variable that is already set, even to an empty string.
    env: {
      AI_MODE: "mock",
      ANTHROPIC_API_KEY: "",
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      SUPABASE_SECRET_KEY: "",
    },
  },
});
