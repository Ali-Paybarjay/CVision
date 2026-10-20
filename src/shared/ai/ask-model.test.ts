import { readFileSync } from "node:fs";
import { join } from "node:path";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { brand } from "@/shared/brand";
import * as contracts from "@/shared/contracts";
import { personas } from "@/shared/sample-data";
import { askModel, AskModelError, loadPrompt } from "./index";

afterEach(() => {
  vi.unstubAllEnvs();
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
});

describe("askModel in live mode", () => {
  it("fails clearly when there is no API key", async () => {
    vi.stubEnv("AI_MODE", "live");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    await expect(
      askModel({ feature: "test", prompt: "x", schema: z.object({ ok: z.boolean() }), sample: { ok: true } }),
    ).rejects.toBeInstanceOf(AskModelError);
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
