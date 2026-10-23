// Loaded before every unit test file (setupFiles in vitest.config.mts), never in prompt evals.
// Unit tests never reach the network (CLAUDE.md, rule 10): a fetch to anywhere but this computer fails at
// once with a clear message, and the API key is emptied, so a test that switches AI_MODE to live by
// mistake stops at "no-api-key" instead of calling Claude.

const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

process.env.ANTHROPIC_API_KEY = "";

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
