import { afterEach, describe, expect, it, vi } from "vitest";
import * as ai from "@/shared/ai";
import { AskModelError } from "@/shared/ai";
import { addAnswer, applyFollowUpDecision, askQuestion, decisionFor, InterviewRuleError } from "./engine/session";
import { analyseStep, decideFollowUp, generateStep, reviewStep, settleFollowUp } from "./engine/stages";
import { processEngineer } from "./fixtures/process-engineer";
import { inputsFor } from "./test-support";

const at = "2026-10-21T09:00:00.000Z";
const later = "2026-10-21T09:04:00.000Z";

async function sessionWithAnswer(questionId: string, answer: string) {
  const inputs = inputsFor(processEngineer);
  let session = await analyseStep(inputs, { id: "s1", startedAt: at });
  session = await generateStep(session, inputs);
  session = await reviewStep(session, inputs);
  session = askQuestion(session, questionId, at, "t1");
  return addAnswer(session, { questionId, kind: "main", text: answer, startedAt: at, submittedAt: later, id: "t2" });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("follow-up decisions", () => {
  it("asks nothing after a complete answer", async () => {
    const session = await sessionWithAnswer("q1", processEngineer.answers.q1.main);
    const { decision } = await decideFollowUp(session, "q1");
    expect(decision.askFollowUp).toBe(false);
  });

  it("asks exactly one follow-up from the planned set after an answer with a gap", async () => {
    const session = await sessionWithAnswer("q2", processEngineer.answers.q2.main);
    const { decision } = await decideFollowUp(session, "q2");
    const question = session.questions.find((q) => q.id === "q2")!;
    expect(decision.askFollowUp).toBe(true);
    expect(question.followUps?.map((f) => f.id)).toContain(decision.plannedFollowUpId);
    expect(decision.usedFallback).toBe(false);

    const next = applyFollowUpDecision(session, decision, later, "t3");
    expect(next.turns?.filter((t) => t.questionId === "q2" && t.kind === "follow-up" && t.speaker === "interviewer")).toHaveLength(1);
  });

  it("asks nothing after 'I don't know', without calling the model", async () => {
    const spy = vi.spyOn(ai, "askModel");
    const session = await sessionWithAnswer("q6", "I don't know.");
    spy.mockClear();
    const { decision } = await decideFollowUp(session, "q6");
    expect(decision.askFollowUp).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("falls back to the planned text when the model's output is invalid", async () => {
    const session = await sessionWithAnswer("q2", processEngineer.answers.q2.main);
    vi.spyOn(ai, "askModel").mockRejectedValueOnce(new AskModelError("did not match its schema", "invalid-answer"));
    const { decision } = await decideFollowUp(session, "q2");
    const planned = session.questions.find((q) => q.id === "q2")!.followUps!;
    expect(decision.askFollowUp).toBe(true);
    expect(decision.usedFallback).toBe(true);
    expect(planned.map((f) => f.text)).toContain(decision.followUpText);
  });

  it("falls back to the planned text when reasoning leaks into the follow-up", async () => {
    const session = await sessionWithAnswer("q2", processEngineer.answers.q2.main);
    vi.spyOn(ai, "askModel").mockResolvedValueOnce({
      askFollowUp: true,
      gapType: "missing-specifics",
      plannedFollowUpId: "q2-f1",
      followUpText:
        "The candidate gave no steps, so I should ask about them. Let me think about which planned question fits best here, probably the first one. What were the main steps?",
      reason: "Missing specifics.",
    });
    const { decision } = await decideFollowUp(session, "q2");
    expect(decision.usedFallback).toBe(true);
    expect(decision.followUpText).toBe("What were the main steps between finding the still idle and running it again?");
  });

  it("uses the planned text when the model's follow-up is not speakable or does not match its gap type", async () => {
    const session = await sessionWithAnswer("q2", processEngineer.answers.q2.main);
    const question = session.questions.find((q) => q.id === "q2")! as Parameters<typeof settleFollowUp>[0];
    const unspeakable = settleFollowUp(question, {
      askFollowUp: true,
      gapType: "missing-specifics",
      plannedFollowUpId: "q2-f1",
      followUpText: "Which steps took the still from 0 to 100 kg/h?",
      reason: "Missing specifics.",
    });
    expect(unspeakable.usedFallback).toBe(true);
    expect(unspeakable.followUpText).toBe(question.followUps[0].text);

    const mismatched = settleFollowUp(question, {
      askFollowUp: true,
      gapType: "unverified-claim",
      plannedFollowUpId: "q2-f1",
      followUpText: "Which steps did you take?",
      reason: "Unverified claim.",
    });
    expect(mismatched.gapType).toBe("missing-specifics");
    expect(mismatched.usedFallback).toBe(true);
  });

  it("makes a second follow-up on the same question impossible", async () => {
    const session = await sessionWithAnswer("q2", processEngineer.answers.q2.main);
    const { decision } = await decideFollowUp(session, "q2");
    let next = applyFollowUpDecision(session, decision, later, "t3");

    // Deciding again returns the recorded decision without asking the model.
    const spy = vi.spyOn(ai, "askModel");
    const again = await decideFollowUp(next, "q2");
    expect(spy).not.toHaveBeenCalled();
    expect(again.decision).toEqual(decisionFor(next, "q2"));

    // And the session refuses a second follow-up, whatever the caller sends.
    expect(() => applyFollowUpDecision(next, { ...decision, followUpText: "And another thing?" }, later, "t4")).toThrow(InterviewRuleError);
    next = addAnswer(next, { questionId: "q2", kind: "follow-up", text: processEngineer.answers.q2.followUp!, startedAt: later, submittedAt: later, id: "t5" });
    expect(() => addAnswer(next, { questionId: "q2", kind: "follow-up", text: "More", startedAt: later, submittedAt: later, id: "t6" })).toThrow(InterviewRuleError);
  });
});
