// Which rules a rejected review answer broke are recorded by name, whether the retry passes or the step fails (#220).
import { afterEach, describe, expect, it, vi } from "vitest";
import * as ai from "@/shared/ai";
import { AskModelError } from "@/shared/ai";
import { analyseStep, generateStep, reviewRejectedEvent, reviewStep } from "./engine/stages";
import { processEngineer } from "./fixtures/process-engineer";
import { inputsFor } from "./test-support";

const tracked = vi.hoisted(() => [] as { name: string; properties: Record<string, unknown> }[]);
vi.mock("@/shared/analytics/track", () => ({
  track: async (name: string, properties: Record<string, unknown>) => void tracked.push({ name, properties }),
}));

const inputs = inputsFor(processEngineer);
const run = { requester: { userId: "user-1" } };
const good = processEngineer.review;
// Two question marks in q2: the model is asked again for this one.
const twoQuestions = { ...good, questions: good.questions.map((q, i) => (i === 1 ? { ...q, text: "Which valve would you check? And why?" } : q)) };

async function generated() {
  const session = await analyseStep(inputs, { id: "s1", startedAt: "2026-10-30T09:00:00.000Z" });
  return generateStep(session, inputs);
}

/** askModel as it behaves live: each answer goes through the schema, and a second rejection throws. */
function answers(...replies: unknown[]) {
  vi.spyOn(ai, "askModel").mockImplementationOnce(async (options) => {
    for (const reply of replies) {
      const result = options.schema.safeParse(reply);
      if (result.success) return result.data;
    }
    throw new AskModelError("The interview-review answer did not match its schema: questions.1.text: Must be one question.", "invalid-answer");
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  tracked.length = 0;
});

describe("recording a rejected review answer", () => {
  it("records the rule when the retry passes", async () => {
    const session = await generated();
    answers(twoQuestions, good);
    const reviewed = await reviewStep(session, inputs, run);
    expect(reviewed.questions[1].text).toBe(good.questions[1].text);
    expect(tracked).toEqual([{ name: reviewRejectedEvent, properties: { stage: "review", rule: "question-shape", count: 1 } }]);
  });

  it("records the rule of both answers when the step fails", async () => {
    const session = await generated();
    answers(twoQuestions, twoQuestions);
    await expect(reviewStep(session, inputs, run)).rejects.toMatchObject({ reason: "invalid-answer" });
    expect(tracked).toEqual([{ name: reviewRejectedEvent, properties: { stage: "review", rule: "question-shape", count: 2 } }]);
  });

  it("records nothing for an answer that passes", async () => {
    const session = await generated();
    answers(good);
    await reviewStep(session, inputs, run);
    expect(tracked.filter((t) => t.name === reviewRejectedEvent)).toEqual([]);
  });
});
