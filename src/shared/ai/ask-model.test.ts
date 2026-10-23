import { readFileSync } from "node:fs";
import { join } from "node:path";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { brand } from "@/shared/brand";
import * as contracts from "@/shared/contracts";
import { personas } from "@/shared/sample-data";
import { openRouterAppHeaders, toOpenRouterModel } from "./config";
import { askModel, AskModelError, loadPrompt } from "./index";
import { createMemoryUsageStore, type Requester, startOfUtcDay, UsageLogError, type UsageStore } from "./usage";

// Live-mode tests talk to a fake client and an in-memory usage log: never the real API or Supabase.
const create = vi.hoisted(() => vi.fn());
const clientOptions = vi.hoisted(() => vi.fn());
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
    constructor(options?: unknown) {
      clientOptions(options);
    }
  },
}));
// Each test gets a fresh usage log, with every call spied on.
const usage = vi.hoisted(() => ({ store: undefined as unknown as ReturnType<typeof spiedStore> }));
vi.mock("./usage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./usage")>();
  return { ...actual, getUsageStore: () => usage.store };
});

function spiedStore(store: UsageStore) {
  return {
    reserve: vi.fn(store.reserve),
    countSince: vi.fn(store.countSince),
    update: vi.fn(store.update),
    delete: vi.fn(store.delete),
    record: vi.fn(store.record),
  } satisfies UsageStore;
}

/** Waits a number of turns of the event loop: a delay that does not depend on the clock, so tests run the same every time. */
async function turns(count: number) {
  for (let turn = 0; turn < count; turn++) await new Promise((resolve) => setImmediate(resolve));
}

/** The in-memory log, but every call takes one to three turns, like a round trip to Supabase. */
function withLatency(store: UsageStore): UsageStore {
  let calls = 0;
  const later = async <T>(run: () => Promise<T>) => {
    await turns(1 + (calls++ % 3));
    return run();
  };
  return {
    reserve: (request) => later(() => store.reserve(request)),
    countSince: (filter, since) => later(() => store.countSince(filter, since)),
    update: (id, used) => later(() => store.update(id, used)),
    delete: (id) => later(() => store.delete(id)),
    record: (entry) => later(() => store.record(entry)),
  };
}

const reply = (text: string) => ({
  stop_reason: "end_turn",
  content: [{ type: "text", text }],
  usage: { input_tokens: 1000, output_tokens: 200 },
});

const askOk = (onUsage: () => void | Promise<void> = () => {}, requester?: Requester) =>
  askModel({
    feature: "test",
    prompt: "x",
    schema: z.object({ ok: z.boolean() }),
    sample: { ok: true },
    voice: false,
    model: "claude-haiku-5-5",
    onUsage,
    requester,
  });

const goLive = () => {
  vi.stubEnv("AI_MODE", "live");
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
};

const sara = { userId: "sara" };
const nothingUsed = { model: "claude-haiku-5-5", inputTokens: 0, outputTokens: 0, costUsd: 0, ok: false };

/** How many rows Sara has in the usage log today. */
const saraToday = () => usage.store.countSince(sara, startOfUtcDay(new Date()));

/** The id of the row askModel reserved for its first request. */
const reservedId = async () => (await usage.store.reserve.mock.results[0].value).id;

beforeEach(() => {
  usage.store = spiedStore(createMemoryUsageStore());
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  create.mockReset();
});

describe("askModel in mock mode", () => {
  it("returns the sample answer without calling the API", async () => {
    const profile = await askModel({
      feature: "test",
      prompt: "Extract a profile",
      schema: contracts.ProfileSchema,
      sample: personas.sara.profile,
    });
    expect(profile.fullName).toBe("Sara Khan");
  });

  it("rejects a sample that does not match the schema", async () => {
    await expect(
      askModel({ feature: "test", prompt: "x", schema: z.object({ score: z.number() }), sample: { score: "high" } as never }),
    ).rejects.toThrow();
  });

  it("does not call onUsage, since nothing is sent", async () => {
    const onUsage = vi.fn();
    await askOk(onUsage);
    expect(onUsage).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});

describe("askModel in live mode", () => {
  it("fails clearly when there is no API key", async () => {
    vi.stubEnv("AI_MODE", "live");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("OPENROUTER_API_KEY", "");
    await expect(
      askModel({ feature: "test", prompt: "x", schema: z.object({ ok: z.boolean() }), sample: { ok: true } }),
    ).rejects.toBeInstanceOf(AskModelError);
  });

  it("reports what the request really used to onUsage", async () => {
    vi.stubEnv("AI_MODE", "live");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    create.mockResolvedValueOnce(reply('{"ok":true}'));
    const onUsage = vi.fn();

    await expect(askOk(onUsage)).resolves.toEqual({ ok: true });
    expect(onUsage.mock.calls).toEqual([
      [{ model: "claude-haiku-5-5", inputTokens: 1000, outputTokens: 200, costUsd: expect.closeTo(0.0002, 10), ok: true }],
    ]);
  });

  it("reports a retry as a request of its own", async () => {
    vi.stubEnv("AI_MODE", "live");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    create.mockResolvedValueOnce(reply('{"ok":"yes"}')).mockResolvedValueOnce(reply('{"ok":true}'));
    const onUsage = vi.fn();

    await expect(askOk(onUsage)).resolves.toEqual({ ok: true });
    expect(onUsage.mock.calls.map(([usage]) => usage.ok)).toEqual([false, true]);
  });
});

describe("askModel and the daily limit", () => {
  it("reserves a row before sending, then fills it in with what the request used", async () => {
    goLive();
    create.mockImplementationOnce(async () => {
      // The row is already there while the model is working.
      await expect(saraToday()).resolves.toBe(1);
      return reply('{"ok":true}');
    });

    await expect(askOk(undefined, sara)).resolves.toEqual({ ok: true });
    expect(usage.store.reserve).toHaveBeenCalledWith({ requester: sara, feature: "test", model: "claude-haiku-5-5" });
    const reserved = await reservedId();
    expect(usage.store.update.mock.calls).toEqual([
      [reserved, { model: "claude-haiku-5-5", inputTokens: 1000, outputTokens: 200, costUsd: expect.closeTo(0.0002, 10), ok: true }],
    ]);
    expect(usage.store.record).not.toHaveBeenCalled();
    await expect(saraToday()).resolves.toBe(1);
  });

  it("logs a retry as a row of its own", async () => {
    goLive();
    create.mockResolvedValueOnce(reply('{"ok":"yes"}')).mockResolvedValueOnce(reply('{"ok":true}'));

    await expect(askOk(undefined, sara)).resolves.toEqual({ ok: true });
    const reserved = await reservedId();
    expect(usage.store.reserve).toHaveBeenCalledTimes(1);
    expect(usage.store.update).toHaveBeenCalledWith(reserved, expect.objectContaining({ inputTokens: 1000, ok: false }));
    expect(usage.store.record).toHaveBeenCalledWith(
      expect.objectContaining({ requester: sara, feature: "test", inputTokens: 1000, ok: true }),
    );
    await expect(saraToday()).resolves.toBe(2);
  });

  it("marks the reserved row as failed when the request to the model throws, and still counts it", async () => {
    goLive();
    const outage = new Error("overloaded");
    create.mockRejectedValueOnce(outage);
    const onUsage = vi.fn();

    await expect(askOk(onUsage, sara)).rejects.toBe(outage);
    const reserved = await reservedId();
    expect(usage.store.update.mock.calls).toEqual([[reserved, nothingUsed]]);
    expect(onUsage).not.toHaveBeenCalled();
    await expect(saraToday()).resolves.toBe(1);
  });

  it("turns a request away at the limit without sending it, and takes back its reservation", async () => {
    goLive();
    vi.stubEnv("AI_DAILY_LIMIT_PER_USER", "1");
    create.mockResolvedValue(reply('{"ok":true}'));

    await expect(askOk(undefined, sara)).resolves.toEqual({ ok: true });
    const refused = askOk(undefined, sara);
    await expect(refused).rejects.toBeInstanceOf(AskModelError);
    await expect(refused).rejects.toMatchObject({ reason: "limit-reached", message: "You have reached today's limit. Try again tomorrow." });
    expect(create).toHaveBeenCalledTimes(1);
    expect(usage.store.delete).toHaveBeenCalledTimes(1);
    await expect(saraToday()).resolves.toBe(1);
  });

  it("never lets more requests reach the model than the limit, however many arrive at once", async () => {
    goLive();
    vi.stubEnv("AI_DAILY_LIMIT_PER_USER", "3");
    usage.store = spiedStore(withLatency(createMemoryUsageStore()));
    create.mockImplementation(async () => {
      await turns(4);
      return reply('{"ok":true}');
    });

    // They arrive a moment apart, each while others are still being checked or answered.
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, async (_, index) => {
        await turns(index);
        return askOk(undefined, sara);
      }),
    );

    const answered = results.filter((result) => result.status === "fulfilled").length;
    expect(answered).toBeGreaterThan(0);
    expect(create.mock.calls.length).toBeLessThanOrEqual(3);
    expect(create.mock.calls.length).toBe(answered);
    for (const result of results) {
      if (result.status === "rejected") expect(result.reason).toMatchObject({ reason: "limit-reached" });
    }
    // The refused reservations are gone: only the requests that reached the model are counted.
    await expect(saraToday()).resolves.toBe(answered);
  });

  it("does not send the request when the usage log cannot reserve a row, and logs why", async () => {
    goLive();
    const failure = new UsageLogError("insert", { message: "Invalid API key" }, 401);
    usage.store.reserve.mockRejectedValueOnce(failure);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(askOk(undefined, sara)).rejects.toBe(failure);
    expect(create).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith("askModel: could not check the daily limit", failure);
  });

  it("does not send the request when the usage log cannot count, and takes back the reservation", async () => {
    goLive();
    const failure = new UsageLogError("count", { message: "" }, 401);
    usage.store.countSince.mockRejectedValueOnce(failure);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(askOk(undefined, sara)).rejects.toBe(failure);
    expect(create).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith("askModel: could not check the daily limit", failure);
    expect(usage.store.delete).toHaveBeenCalledTimes(1);
    await expect(saraToday()).resolves.toBe(0);
  });

  it("keeps the answer when the reserved row cannot be filled in, and logs why", async () => {
    goLive();
    create.mockResolvedValueOnce(reply('{"ok":true}'));
    const failure = new UsageLogError("update", { message: "Service Unavailable" }, 503);
    usage.store.update.mockRejectedValueOnce(failure);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(askOk(undefined, sara)).resolves.toEqual({ ok: true });
    expect(consoleError).toHaveBeenCalledWith("askModel: could not record usage", failure);
  });

  it("passes the model's own failure on when the failed row cannot be filled in either", async () => {
    goLive();
    const outage = new Error("overloaded");
    create.mockRejectedValueOnce(outage);
    usage.store.update.mockRejectedValueOnce(new UsageLogError("update", { message: "Service Unavailable" }, 503));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(askOk(undefined, sara)).rejects.toBe(outage);
  });

  it("sends nothing and logs nothing in mock mode", async () => {
    await expect(askOk(undefined, sara)).resolves.toEqual({ ok: true });
    expect(create).not.toHaveBeenCalled();
    expect(usage.store.reserve).not.toHaveBeenCalled();
    expect(usage.store.countSince).not.toHaveBeenCalled();
  });

  it.each([
    [
      "throws",
      () => {
        throw new Error("broken callback");
      },
    ],
    [
      "is async and rejects",
      async () => {
        throw new Error("broken callback");
      },
    ],
  ])("keeps the answer when onUsage %s", async (_, onUsage) => {
    vi.stubEnv("AI_MODE", "live");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    create.mockResolvedValueOnce(reply('{"ok":true}'));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(askOk(onUsage)).resolves.toEqual({ ok: true });
    expect(create).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith("askModel: onUsage failed", expect.any(Error));
    consoleError.mockRestore();
  });
});

describe("askModel through OpenRouter", () => {
  it("sends the request to OpenRouter with its key, model name and app name, and logs Anthropic's name", async () => {
    vi.stubEnv("AI_MODE", "live");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("OPENROUTER_API_KEY", "openrouter-test-key");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "cvision.example");
    create.mockResolvedValueOnce(reply('{"ok":true}'));
    const onUsage = vi.fn();

    await expect(askOk(onUsage)).resolves.toEqual({ ok: true });
    expect(clientOptions).toHaveBeenCalledWith({
      baseURL: "https://openrouter.ai/api",
      apiKey: null,
      authToken: "openrouter-test-key",
      defaultHeaders: { "HTTP-Referer": "https://cvision.example", "X-OpenRouter-Title": "CVision" },
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ model: "anthropic/claude-haiku-5.5" }));
    expect(onUsage.mock.calls[0][0]).toMatchObject({ model: "claude-haiku-5-5", costUsd: expect.closeTo(0.0002, 10) });
  });

  it("goes straight to Anthropic when both keys are set", async () => {
    vi.stubEnv("AI_MODE", "live");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("OPENROUTER_API_KEY", "openrouter-test-key");
    create.mockResolvedValueOnce(reply('{"ok":true}'));

    await expect(askOk(() => {})).resolves.toEqual({ ok: true });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ model: "claude-haiku-5-5" }));
  });

  it.each([
    ["claude-haiku-5-5", "anthropic/claude-haiku-5.5"],
    ["claude-fable-5-1", "anthropic/claude-fable-5.1"],
    ["claude-opus-5", "anthropic/claude-opus-5"],
    ["anthropic/claude-sonnet-5.5", "anthropic/claude-sonnet-5.5"],
  ])("names %s as %s", (model, expected) => {
    expect(toOpenRouterModel(model)).toBe(expected);
  });

  it("names the app from localhost when not on Vercel", () => {
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    expect(openRouterAppHeaders()).toEqual({ "HTTP-Referer": "http://localhost:3000", "X-OpenRouter-Title": "CVision" });
  });
});

describe("contracts work as structured output formats", () => {
  const schemas = Object.entries(contracts).filter(
    ([name, value]) => name.endsWith("Schema") && value instanceof z.ZodObject,
  );

  it.each(schemas)("%s converts to a JSON schema", (_, schema) => {
    expect(() => zodOutputFormat(schema as z.ZodObject)).not.toThrow();
  });
});

describe("prompts", () => {
  it("loads the voice rules", async () => {
    const voice = await loadPrompt("_voice");
    expect(voice).toContain("UK English");
  });

  it("lists every banned phrase in the voice rules", () => {
    const voice = readFileSync(join(process.cwd(), "prompts", "_voice.md"), "utf8");
    for (const phrase of brand.bannedPhrases) {
      expect(voice).toContain(phrase);
    }
  });

  it("refuses names that could leave the prompts folder", async () => {
    await expect(loadPrompt("../package")).rejects.toThrow("Invalid prompt name");
  });
});
