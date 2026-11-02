// Stage 3 sends back only the questions it rewrote (#100), and the code puts them in place. Which rules a rejected
// review answer broke are recorded by name, whether the retry passes or the step fails (#220).
import { afterEach, describe, expect, it, vi } from "vitest";
import * as ai from "@/shared/ai";
import { AskModelError } from "@/shared/ai";
import { reviewReplyFromSet, reviewReplySchema, type ReviewOutput, type ReviewReply } from "./engine/schemas";
import { analyseStep, generateStep, reviewRejectedEvent, reviewStep } from "./engine/stages";
import { dataAnalystSara } from "./fixtures/data-analyst-sara";
import { processEngineer } from "./fixtures/process-engineer";
import { inputsFor, questionSetContextFor } from "./test-support";

const tracked = vi.hoisted(() => [] as { name: string; properties: Record<string, unknown> }[]);
vi.mock("@/shared/analytics/track", () => ({
  track: async (name: string, properties: Record<string, unknown>) => void tracked.push({ name, properties }),
}));

const inputs = inputsFor(processEngineer);
const context = questionSetContextFor(processEngineer);
const run = { requester: { userId: "user-1" } };
const draft = processEngineer.generate;
const reviewed = processEngineer.review;
/** The reply that turns the generated set into this one. */
const replyFor = (set: ReviewOutput): ReviewReply => reviewReplyFromSet(set, draft);
const good = replyFor(reviewed);
// Two question marks in q2: the model is asked again for this one.
const twoQuestions = replyFor({ ...reviewed, questions: reviewed.questions.map((q, i) => (i === 1 ? { ...q, text: "Which valve would you check? And why?" } : q)) });
const nothingChanged: ReviewReply = { blueprint: draft.blueprint, rewritten: [], changelog: [] };

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
    throw new AskModelError("The interview-review answer did not match its schema: rewritten.0.text: Must be one question.", "invalid-answer");
  });
}

function issues(reply: unknown, set: { questions: ReviewOutput["questions"] } = draft) {
  const result = reviewReplySchema(context, set).safeParse(reply);
  return result.success ? [] : result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
}

afterEach(() => {
  vi.restoreAllMocks();
  tracked.length = 0;
});

describe("the review sends back only what it rewrote (#100)", () => {
  it("puts each rewritten question in place of the one with its id and keeps the rest as generated", async () => {
    const session = await generated();
    expect(good.rewritten.length).toBeGreaterThan(0);
    expect(good.rewritten.length).toBeLessThan(draft.questions.length);
    answers(good);
    const after = await reviewStep(session, inputs, run);
    expect(after.questions.map((q) => q.id)).toEqual(draft.questions.map((q) => q.id));
    expect(after.questions.map((q) => q.text)).toEqual(reviewed.questions.map((q) => q.text));
    const rewrittenIds = new Set(good.rewritten.map((q) => q.id));
    for (const question of after.questions.filter((q) => !rewrittenIds.has(q.id))) {
      expect(question.text).toBe(draft.questions.find((q) => q.id === question.id)?.text);
    }
  });

  it("keeps the generated set when nothing needs changing", async () => {
    // Sara's generated set passes every review rule as it is.
    const saraInputs = inputsFor(dataAnalystSara);
    const session = await generateStep(await analyseStep(saraInputs, { id: "s2", startedAt: "2026-10-30T09:00:00.000Z" }), saraInputs);
    answers({ blueprint: dataAnalystSara.generate.blueprint, rewritten: [], changelog: [] });
    const after = await reviewStep(session, saraInputs, run);
    expect(after.questions.map((q) => q.text)).toEqual(dataAnalystSara.generate.questions.map((q) => q.text));
    expect(tracked.filter((t) => t.name === reviewRejectedEvent)).toEqual([]);
  });

  it("names a question the review left out when it breaks a rule, and the retry rewrites it", async () => {
    // The process engineer's generated q6 has a symbol in it: the review must rewrite it, not leave it out.
    expect(issues(nothingChanged)).toEqual([
      "rewritten: Question q6 (text) is not in rewritten but breaks a rule: Must be speakable: no symbols or abbreviated units. Rewrite it in full and add it to rewritten.",
    ]);
    const session = await generated();
    answers(nothingChanged, good);
    const after = await reviewStep(session, inputs, run);
    expect(after.questions[5].text).toBe(reviewed.questions[5].text);
    expect(tracked).toEqual([{ name: reviewRejectedEvent, properties: { stage: "review", rule: "question-speakable", count: 1 } }]);
  });

  it("points a rule broken in a rewritten question at its place in rewritten", () => {
    const j = twoQuestions.rewritten.findIndex((q) => q.id === "q2");
    expect(issues(twoQuestions)).toEqual([`rewritten.${j}.text: Must be one question with a single question mark at the end.`]);
  });

  it("sends back a changelog entry without its rewritten question, an unknown id and a question given twice", () => {
    const change = reviewed.changelog[0];
    expect(issues({ ...nothingChanged, changelog: [change] })).toEqual([
      "changelog.0.questionId: Must be the id of a question in rewritten: add the rewritten question.",
    ]);
    const unknown = { ...good.rewritten[0], id: "q9" };
    expect(issues({ ...nothingChanged, rewritten: [unknown] })).toEqual(["rewritten.0.id: Must be the id of a question in the set."]);
    expect(issues({ ...good, rewritten: [good.rewritten[0], good.rewritten[0]] })).toContain("rewritten.1.id: Give each rewritten question once.");
  });
});

describe("recording a rejected review answer", () => {
  it("records the rule when the retry passes", async () => {
    const session = await generated();
    answers(twoQuestions, good);
    const after = await reviewStep(session, inputs, run);
    expect(after.questions[1].text).toBe(reviewed.questions[1].text);
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
