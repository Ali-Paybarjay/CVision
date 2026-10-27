import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import * as sdkErrors from "@anthropic-ai/sdk/core/error";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { io } from "next/cache";
import { after } from "next/server";
import type { z } from "zod";
import { track } from "@/shared/analytics/track";
import { cleanModelText, type HiddenCharacterCounts } from "@/shared/clean-text";
import {
  type AiProvider,
  DEFAULT_MODEL,
  getAiMode,
  getAiProvider,
  OPENROUTER_BASE_URL,
  openRouterAppHeaders,
  toOpenRouterModel,
} from "./config";
import { loadVoice } from "./prompts";
import {
  estimateCostUsd,
  getUsageStore,
  LimitReachedError,
  type ModelUsage,
  releaseReservation,
  type Requester,
  reserveWithinDailyLimit,
  type UsageRowId,
} from "./usage";

export type AskModelOptions<S extends z.ZodType> = {
  /** Who is asking, for usage logs and daily limits, e.g. "profile-extract" or "cv-check". */
  feature: string;
  /** The full request text, usually from loadPrompt(). In live mode its hidden characters are removed before it is sent. */
  prompt: string;
  /** The shape the answer must have (from src/shared/contracts or your own). */
  schema: S;
  /** Returned as-is in mock mode, and checked against the schema. */
  sample: z.input<S>;
  /** Add the brand voice from prompts/_voice.md. Default true; set false for pure data extraction. */
  voice?: boolean;
  /** The signed-in user, or an anonymous key for the CV check. Used for daily limits. */
  requester?: Requester;
  /** Defaults to Claude Haiku 5.5 (AI_MODEL can change the default). */
  model?: string;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
  /**
   * Live mode only: called after each request to the model, a retry included, with the tokens it really used.
   * askModel waits for it, so an async callback that writes somewhere should be quick.
   */
  onUsage?: (usage: ModelUsage) => void | Promise<void>;
};

export class AskModelError extends Error {
  constructor(
    message: string,
    readonly reason: "no-api-key" | "limit-reached" | "refused" | "invalid-answer",
  ) {
    super(message);
    this.name = "AskModelError";
  }
}

const baseInstructions =
  "Answer only with JSON that matches the required format. Use only facts from the input; if something is unknown, leave it empty rather than guessing.";

const clients: Partial<Record<AiProvider, Anthropic>> = {};

function createClient(provider: AiProvider): Anthropic {
  if (provider === "anthropic") return new Anthropic();
  // OpenRouter speaks the same Messages API, but wants its key as a Bearer token rather than x-api-key.
  return new Anthropic({
    baseURL: OPENROUTER_BASE_URL,
    apiKey: null,
    authToken: process.env.OPENROUTER_API_KEY,
    defaultHeaders: openRouterAppHeaders(),
  });
}

/**
 * The one way to ask a language model for anything in CVision.
 * In mock mode (the default) it sends nothing and returns `sample`.
 * In live mode it removes hidden characters from the prompt (cleanModelText), reserves a place within the daily
 * limit, asks Claude for JSON, logs the usage, checks the answer against `schema`, and asks once more if it does
 * not fit. If the model never answers, the place is given back. A request the model never answers, and one turned
 * away at a daily limit, are recorded as events (ai.failed, ai.limited) that never say who asked.
 */
export async function askModel<S extends z.ZodType>(options: AskModelOptions<S>): Promise<z.output<S>> {
  if (getAiMode() === "mock") {
    return options.schema.parse(options.sample);
  }

  const provider = getAiProvider();
  if (!provider) {
    throw new AskModelError("AI_MODE is live but neither ANTHROPIC_API_KEY nor OPENROUTER_API_KEY is set.", "no-api-key");
  }
  // A live request reads the clock (daily limits) and spends tokens: never inside a prerender or prefetch.
  await io();

  // Usage and cost are logged under Anthropic's model name, whichever provider serves it.
  const model = options.model ?? DEFAULT_MODEL;
  // Everything is ready before the reservation, so a reserved row always means a request was sent.
  const client = (clients[provider] ??= createClient(provider));
  const system = options.voice === false ? baseInstructions : `${baseInstructions}\n\n${await loadVoice()}`;
  const format = zodOutputFormat(options.schema);
  // Text copied from a job board or a file can hide an instruction in characters a reader cannot see.
  // Cleaned once, so the retry sends the same clean text. Mock mode never reads the prompt, so it needs no cleaning.
  const { text: cleanPrompt, counts: hidden } = cleanModelText(options.prompt);

  let reserved: UsageRowId;
  try {
    reserved = await reserveWithinDailyLimit({ requester: options.requester, feature: options.feature, model }, getUsageStore());
  } catch (error) {
    if (error instanceof LimitReachedError) {
      const { limit } = error;
      recordAfterResponse(() => track("ai.limited", { feature: options.feature, limit }));
      throw new AskModelError(error.message, "limit-reached");
    }
    // Without the usage log there is no daily limit, so nothing is sent; log why, since callers may not.
    console.error("askModel: could not check the daily limit", error);
    throw error;
  }
  let prompt = cleanPrompt;
  let problem = "";

  for (let attempt = 1; attempt <= 2; attempt++) {
    // The first request fills in the row reserved for it; a retry counts as a request of its own.
    const row = attempt === 1 ? reserved : undefined;
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: provider === "openrouter" ? toOpenRouterModel(model) : model,
        max_tokens: options.maxTokens ?? 16000,
        system,
        messages: [{ role: "user", content: prompt }],
        output_config: { effort: options.effort ?? "medium", format },
      });
    } catch (error) {
      // API errors (limits, outages, timeouts) are retried by the SDK itself and reach the caller unchanged.
      // With no answer there is nothing to log, and the request gives its place back, so an outage uses up
      // nobody's daily requests, such as a visitor's free checks. A failed retry had no place to give back.
      // Either way the failure is recorded as an event, since the usage log keeps no row for it.
      recordFailure(options.feature, error);
      if (row !== undefined) await releaseReservation(row, getUsageStore());
      throw error;
    }
    // Once, when the first request has its answer and so keeps its row: the daily limit then bounds these events.
    // A request turned away at the limit, or one the model never answered, records none.
    if (attempt === 1 && removedCount(hidden) > 0) recordHiddenText(options.feature, hidden, options.requester);

    if (response.stop_reason === "refusal") {
      await logUsage(options, row, model, response.usage, false);
      throw new AskModelError(`The model declined the ${options.feature} request.`, "refused");
    }

    const text = response.content.find((block) => block.type === "text")?.text;
    const result = text === undefined ? null : parseJson(options.schema, text);
    await logUsage(options, row, model, response.usage, result?.success === true);

    if (result?.success) {
      return result.data;
    }

    problem = result ? result.problem : `the answer stopped early (${response.stop_reason})`;
    prompt = `${cleanPrompt}\n\nYour previous answer did not match the required format: ${problem}\nAnswer again with complete JSON that matches it exactly.`;
  }

  throw new AskModelError(`The ${options.feature} answer did not match its schema: ${problem}`, "invalid-answer");
}

/**
 * How many characters cleanModelText removed. Line separators became "\n" and stay, and every tamper sign is already
 * counted under its own kind.
 */
function removedCount(counts: HiddenCharacterCounts): number {
  return Object.entries(counts)
    .filter(([kind]) => kind !== "lineSeparator" && kind !== "tamperSigns")
    .reduce((sum, [, count]) => sum + count, 0);
}

/**
 * Records that hidden characters were removed from a prompt: the feature and how many of each kind, never the text.
 * tamperSigns is only recorded, never used to turn a request away: a Persian name written with U+200C raises it too.
 */
function recordHiddenText(feature: string, counts: HiddenCharacterCounts, requester: Requester | undefined): void {
  recordAfterResponse(() => track("ai.hidden_text_removed", { feature, removed: removedCount(counts), ...counts }, requester));
}

/**
 * Records that a request to the model threw: the feature, the error's class (such as RateLimitError) and its HTTP
 * status when it has one. Never the error's message, which can quote the request, and never who asked.
 */
function recordFailure(feature: string, error: unknown): void {
  const status = (error as { status?: unknown } | null | undefined)?.status;
  const properties = { feature, error: errorClass(error), ...(typeof status === "number" && { status }) };
  recordAfterResponse(() => track("ai.failed", properties));
}

/**
 * The name of what was thrown, such as RateLimitError. A production build renames the SDK's classes, so their
 * constructor names are useless there: the SDK's errors are named by their exports, any other error by its own name.
 */
function errorClass(error: unknown): string {
  if (!(error instanceof Error)) return typeof error;
  return Object.entries(sdkErrors).find(([, value]) => value === error.constructor)?.[0] ?? error.name;
}

/** Records an event after the response is sent, so the user never waits for it. track never throws. */
function recordAfterResponse(record: () => Promise<void>): void {
  try {
    after(record);
  } catch {
    // Outside a request, as in a prompt eval, after() throws and there is no response to wait for.
    void record();
  }
}

function parseJson<S extends z.ZodType>(
  schema: S,
  text: string,
): { success: true; data: z.output<S> } | { success: false; problem: string } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { success: false, problem: "it was not valid JSON" };
  }
  const result = schema.safeParse(value);
  if (result.success) return { success: true, data: result.data };
  const issues = result.error.issues.slice(0, 5).map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
  return { success: false, problem: issues.join("; ") };
}

async function logUsage(
  options: AskModelOptions<z.ZodType>,
  row: UsageRowId | undefined,
  model: string,
  usage: Anthropic.Usage,
  ok: boolean,
): Promise<void> {
  const used: ModelUsage = {
    model,
    inputTokens: usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0),
    outputTokens: usage.output_tokens,
    costUsd: estimateCostUsd(model, usage),
    ok,
  };
  // A logging failure must never break the user's request, and neither must the caller's onUsage.
  await saveUsage(options, row, used);
  try {
    await options.onUsage?.(used);
  } catch (error) {
    console.error("askModel: onUsage failed", error);
  }
}

/** Fills in the request's reserved row, or adds a row for a retry. Failures are logged, never thrown. */
async function saveUsage(options: AskModelOptions<z.ZodType>, row: UsageRowId | undefined, used: ModelUsage): Promise<void> {
  try {
    if (row === undefined) await getUsageStore().record({ requester: options.requester, feature: options.feature, ...used });
    else await getUsageStore().update(row, used);
  } catch (error) {
    console.error("askModel: could not record usage", error);
  }
}
