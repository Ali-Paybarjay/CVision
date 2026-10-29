// Loaded before every unit test file (setupFiles in vitest.config.mts), never in prompt evals.
// Unit tests never reach the network (CLAUDE.md, rule 10): a fetch to anywhere but this computer fails at
// once with a clear message, and every AI key and Supabase setting from the developer's shell is emptied,
// so a test that switches AI_MODE to live by mistake stops at "no-api-key" instead of calling Claude, and
// no test sees a real key or a real Supabase project. A test that needs one sets it with vi.stubEnv.

const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

// The keys and addresses in .env.example, plus the base URL and auth token the Anthropic SDK reads from the
// shell by itself, and VERCEL, so the app does not think it runs on Vercel and demand the keys emptied here.
// The app and the SDK treat an empty value as unset, so these read exactly as they do in CI.
const realServiceEnv = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
  "OPENROUTER_API_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "ANONYMOUS_KEY_SALT",
  "VERCEL",
];

for (const name of realServiceEnv) process.env[name] = "";

const realFetch = globalThis.fetch;

globalThis.fetch = async (input, init) => {
  const href = input instanceof Request ? input.url : String(input);
  // An address fetch cannot read anyway goes through, so it fails with fetch's own error.
  if (URL.canParse(href)) {
    const { hostname, origin } = new URL(href);
    if (!localHosts.has(hostname)) {
      throw new Error(`Unit tests cannot reach the network: a fetch to ${origin} was blocked. Mock it instead (src/shared/testing/no-network.ts).`);
    }
  }
  return realFetch(input, init);
};
