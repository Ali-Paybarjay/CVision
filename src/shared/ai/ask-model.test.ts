import { readFileSync } from "node:fs";
import { join } from "node:path";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { brand } from "@/shared/brand";
import * as contracts from "@/shared/contracts";
import { personas } from "@/shared/sample-data";
import { openRouterAppHeaders, toOpenRouterModel } from "./config";
import { askModel, AskModelError, loadPrompt } from "./index";

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
vi.mock("./usage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./usage")>();
  const store = actual.createMemoryUsageStore();
  return { ...actual, getUsageStore: () => store, assertWithinDailyLimit: async () => {} };
});

const reply = (text: string) => ({
  stop_reason: "end_turn",
  content: [{ type: "text", text }],
  usage: { input_tokens: 1000, output_tokens: 200 },
});

const askOk = (onUsage: () => void | Promise<void>) =>
  askModel({ feature: "test", prompt: "x", schema: z.object({ ok: z.boolean() }), sample: { ok: true }, voice: false, model: "claude-haiku-5-5", onUsage });

afterEach(() => {
  vi.unstubAllEnvs();
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
