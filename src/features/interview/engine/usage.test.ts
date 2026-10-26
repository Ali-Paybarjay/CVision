import { beforeEach, describe, expect, it, vi } from "vitest";
import { fixtures } from "../fixtures";
import { runMockSession } from "../test-support";

const askModelBehaviour = vi.hoisted(() => ({ failFollowUp: false }));

// Stands in for a live askModel: each stage makes a request and a retry, and reports both through onUsage.
vi.mock("@/shared/ai", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/shared/ai")>();
  return {
    ...original,
    askModel: vi.fn(async (options: Parameters<typeof original.askModel>[0]) => {
      for (let i = 0; i < 2; i++) {
        await options.onUsage?.({ model: "claude-haiku-5-5", inputTokens: 1000, outputTokens: 4000, costUsd: 0.0021, ok: i === 1 });
      }
      if (askModelBehaviour.failFollowUp && options.feature === "interview-followup") {
        throw new original.AskModelError("The model's answer did not match the schema twice.", "invalid-answer");
      }
      return options.sample;
    }),
  };
});

describe("stage usage when askModel reports it", () => {
  beforeEach(() => {
    askModelBehaviour.failFollowUp = false;
  });

  it("records the reported tokens and cost, retries included, instead of an estimate", async () => {
    const session = await runMockSession(fixtures[0]);
    expect(session.usage?.length).toBeGreaterThan(0);
    for (const entry of session.usage ?? []) {
      expect(entry).toMatchObject({ estimated: false, inputTokens: 2000, outputTokens: 8000, costUsd: 0.0042 });
    }
  });

  it("still records what a follow-up cost when both answers were rejected", async () => {
    askModelBehaviour.failFollowUp = true;
    const session = await runMockSession(fixtures[0]);
    const followUps = (session.usage ?? []).filter((entry) => entry.stage === "followUp");
    expect(followUps.length).toBeGreaterThan(0);
    for (const entry of followUps) {
      expect(entry).toMatchObject({ estimated: false, inputTokens: 2000, outputTokens: 8000 });
    }
  });
});
