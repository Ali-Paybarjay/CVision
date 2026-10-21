import { pricesPerMillion } from "../config";
import type { StageUsage } from "../contracts";

/** About four characters per token in English text. Good enough for an estimate, not for billing. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = pricesPerMillion[model] ?? pricesPerMillion["claude-sonnet-5-5"];
  return Math.round(((inputTokens * price.input + outputTokens * price.output) / 1_000_000) * 1e6) / 1e6;
}

/**
 * askModel does not report token usage yet, so usage is estimated from the request and answer text.
 * Thinking tokens are not included, so live costs will be higher.
 */
export function estimateUsage(options: {
  stage: string;
  model: string;
  input: string;
  /** Characters sent that the caller cannot see, such as askModel's own instructions. */
  extraInputChars?: number;
  output: unknown;
  questionId?: string;
}): StageUsage {
  const inputTokens = estimateTokens(options.input) + Math.ceil((options.extraInputChars ?? 0) / 4);
  const outputTokens = estimateTokens(JSON.stringify(options.output));
  return {
    stage: options.stage,
    ...(options.questionId ? { questionId: options.questionId } : {}),
    model: options.model,
    inputTokens,
    outputTokens,
    costUsd: costUsd(options.model, inputTokens, outputTokens),
    estimated: true,
  };
}

export function usageTotals(usage: StageUsage[]) {
  return usage.reduce(
    (total, entry) => ({
      inputTokens: total.inputTokens + entry.inputTokens,
      outputTokens: total.outputTokens + entry.outputTokens,
      costUsd: Math.round((total.costUsd + entry.costUsd) * 1e6) / 1e6,
    }),
    { inputTokens: 0, outputTokens: 0, costUsd: 0 },
  );
}
