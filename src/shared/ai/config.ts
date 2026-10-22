export type AiMode = "mock" | "live";

/**
 * mock (the default): no request is sent and askModel returns the sample answer.
 * live: askModel calls Claude with ANTHROPIC_API_KEY or OPENROUTER_API_KEY (see getAiProvider).
 */
export function getAiMode(): AiMode {
  return process.env.AI_MODE === "live" ? "live" : "mock";
}

/** Haiku is the team default; a feature that needs more quality passes its own model. */
export const DEFAULT_MODEL = process.env.AI_MODEL || "claude-haiku-5-5";

export type AiProvider = "anthropic" | "openrouter";

/**
 * Where live requests go: straight to Anthropic when ANTHROPIC_API_KEY is set,
 * otherwise through OpenRouter when OPENROUTER_API_KEY is set. Null when there is no key.
 */
export function getAiProvider(): AiProvider | null {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENROUTER_API_KEY) return "openrouter";
  return null;
}

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api";

/**
 * OpenRouter's name for a Claude model: "claude-haiku-5-5" becomes "anthropic/claude-haiku-5.5".
 * Features keep using Anthropic's names; any other name is sent unchanged.
 */
export function toOpenRouterModel(model: string): string {
  const match = /^claude-([a-z]+)-(\d+)(?:-(\d+))?$/.exec(model);
  if (!match) return model;
  const [, family, major, minor] = match;
  return `anthropic/claude-${family}-${major}${minor ? `.${minor}` : ""}`;
}
