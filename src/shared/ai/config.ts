export type AiMode = "mock" | "live";

/**
 * mock (the default): no request is sent and askModel returns the sample answer.
 * live: askModel calls the Claude API with ANTHROPIC_API_KEY.
 */
export function getAiMode(): AiMode {
  return process.env.AI_MODE === "live" ? "live" : "mock";
}

/** Haiku is the team default; a feature that needs more quality passes its own model. */
export const DEFAULT_MODEL = process.env.AI_MODEL || "claude-haiku-5-5";
