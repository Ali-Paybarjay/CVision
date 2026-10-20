import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { DEFAULT_MODEL, getAiMode } from "./config";
import { loadVoice } from "./prompts";

export type AskModelOptions<S extends z.ZodType> = {
  /** Who is asking, for usage logs and daily limits, e.g. "profile-extract" or "cv-check". */
  feature: string;
  /** The full request text, usually from loadPrompt(). */
  prompt: string;
  /** The shape the answer must have (from src/shared/contracts or your own). */
  schema: S;
  /** Returned as-is in mock mode, and checked against the schema. */
  sample: z.input<S>;
  /** Add the brand voice from prompts/_voice.md. Default true; set false for pure data extraction. */
  voice?: boolean;
  /** The signed-in user, or an anonymous key for the CV check. Used for daily limits. */
  requester?: { userId: string } | { anonymousKey: string };
  /** Defaults to Claude Haiku 5.5 (AI_MODEL can change the default). */
  model?: string;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
};

export class AskModelError extends Error {
  constructor(
    message: string,
    readonly reason: "no-api-key" | "refused" | "invalid-answer",
  ) {
    super(message);
    this.name = "AskModelError";
  }
}

const baseInstructions =
  "Answer only with JSON that matches the required format. Use only facts from the input; if something is unknown, leave it empty rather than guessing.";

let client: Anthropic | undefined;

/**
 * The one way to ask a language model for anything in CVision.
 * In mock mode (the default) it sends nothing and returns `sample`.
 * In live mode it asks Claude for JSON, checks it against `schema`, and asks once more if it does not fit.
 */
export async function askModel<S extends z.ZodType>(options: AskModelOptions<S>): Promise<z.output<S>> {
  if (getAiMode() === "mock") {
    return options.schema.parse(options.sample);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AskModelError("AI_MODE is live but ANTHROPIC_API_KEY is not set.", "no-api-key");
  }
  client ??= new Anthropic();

  const system = options.voice === false ? baseInstructions : `${baseInstructions}\n\n${await loadVoice()}`;
  let prompt = options.prompt;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await client.messages.parse({
        model: options.model ?? DEFAULT_MODEL,
        max_tokens: options.maxTokens ?? 16000,
        system,
        messages: [{ role: "user", content: prompt }],
        output_config: {
          effort: options.effort ?? "medium",
          format: zodOutputFormat(options.schema),
        },
      });

      if (response.stop_reason === "refusal") {
        throw new AskModelError(`The model declined the ${options.feature} request.`, "refused");
      }
      if (response.parsed_output != null) {
        return response.parsed_output as z.output<S>;
      }
      prompt = `${options.prompt}\n\nYour previous answer was incomplete. Answer again with the full JSON.`;
    } catch (error) {
      // API errors (limits, outages) are already retried by the SDK; only a malformed answer is retried here.
      if (error instanceof AskModelError || error instanceof Anthropic.APIError) {
        throw error;
      }
      if (attempt === 2) {
        throw new AskModelError(`The ${options.feature} answer did not match its schema: ${String(error)}`, "invalid-answer");
      }
      prompt = `${options.prompt}\n\nYour previous answer did not match the required format:\n${String(error)}\nAnswer again with JSON that matches it exactly.`;
    }
  }

  throw new AskModelError(`The ${options.feature} answer was incomplete twice.`, "invalid-answer");
}
