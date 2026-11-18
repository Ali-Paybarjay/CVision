// "Skip this question" (#530) in mock mode: the question is closed with no answer, no follow-up and no score, the next
// question comes, and once every question is done the practice ends as "End here" ends it (#205).
import { describe, expect, it } from "vitest";
import type { InterviewSession } from "./contracts";
import {
  addAnswer,
  applyEvaluation,
  applyFollowUpDecision,
  applySuggestion,
  askQuestion,
  endEarly,
  endIfSkipped,
  endedOverall,
  evaluationFor,
  isSkipped,
  nextStep,
  reportQuestionIds,
  skipQuestion,
  unansweredQuestionIds,
} from "./engine/session";
import { sessionOverall } from "./engine/scoring";
import { decideFollowUp, evaluateAnswer, suggestAnswer, writeReport } from "./engine/stages";
import { dataAnalystSara as fixture } from "./fixtures/data-analyst-sara";
import { sessionEndedEarlyProperties } from "./server/completion-event";
import { inputsFor, readySessionFor, runMockSession } from "./test-support";

const at = "2026-11-18T20:00:00.000Z";
const inputs = inputsFor(fixture);
const noFollowUp = (questionId: string) => ({ questionId, askFollowUp: false, gapType: "none" as const, usedFallback: false, reason: "Moving on." });

/** Asks the question the session is waiting to ask, as the page does after each finished question. */
function askNext(session: InterviewSession): InterviewSession {
  const next = nextStep(session);
  return next.step === "ask" ? askQuestion(session, next.questionId, at, `${next.questionId}-asked`) : session;
}

/** Answers the current question with the fixture's sample, which gets no follow-up (q1, q3 and q4). */
function answerWithSample(session: InterviewSession, questionId: string): InterviewSession {
  const answered = addAnswer(session, { questionId, kind: "main", text: fixture.answers[questionId].main, startedAt: at, submittedAt: at, id: `${questionId}-answer` });
  return applyFollowUpDecision(answered, noFollowUp(questionId), at, `${questionId}-decision`);
}

const atFirst = () => askNext(readySessionFor(fixture));

describe("Skip this question", () => {
  it("closes the question with no answer and no follow-up, and the next question comes", () => {
    const skipped = skipQuestion(atFirst(), "q1", at);
    expect(isSkipped(skipped, "q1")).toBe(true);
    expect(skipped.followUpDecisions).toEqual([expect.objectContaining({ questionId: "q1", askFollowUp: false })]);
    expect(nextStep(skipped)).toEqual({ step: "ask", questionId: "q2" });
    expect(nextStep(askNext(skipped))).toEqual({ step: "answer", questionId: "q2", kind: "main" });
    // Still going, so it has not ended, and nothing is left to suggest yet.
    expect(skipped.endedAt).toBeUndefined();
    expect(unansweredQuestionIds(skipped)).toEqual([]);
  });

  it("sends nothing to the model for the skipped question: no follow-up decision and no score", async () => {
    const skipped = askNext(skipQuestion(atFirst(), "q1", at));
    // The decision is the one recorded with the skip: no request, so no usage.
    const decided = await decideFollowUp(skipped, "q1");
    expect(decided.usage).toBeUndefined();
    expect(decided.decision.reason).toBe("The candidate skipped this question.");
    expect(reportQuestionIds(skipped)).toEqual(["q2", "q3", "q4", "q5", "q6"]);
    await expect(evaluateAnswer(skipped, "q1")).rejects.toThrow("q1 was skipped, so it is not scored.");
  });

  it("refuses a question that is not waiting for its answer", () => {
    const session = atFirst();
    expect(() => skipQuestion(session, "q2", at)).toThrow("q2 is not waiting for its answer.");
    expect(() => skipQuestion(answerWithSample(session, "q1"), "q1", at)).toThrow("q1 is not waiting for its answer.");
    expect(() => skipQuestion(endEarly(session, at), "q1", at)).toThrow("q1 is not waiting for its answer.");
  });

  it("is not an answer typed as 'skip' or 'I don't know', which is scored as before", () => {
    const typed = addAnswer(atFirst(), { questionId: "q1", kind: "main", text: "skip", startedAt: at, submittedAt: at, id: "typed" });
    expect(isSkipped(typed, "q1")).toBe(false);
    expect(reportQuestionIds(typed)).toContain("q1");
  });
});

describe("the end of a practice with a question skipped", () => {
  it("ends as 'End here' ends it once the last question is skipped, with no score for the skipped ones", async () => {
    let session = atFirst();
    session = askNext(answerWithSample(session, "q1"));
    for (const id of ["q2", "q3", "q4", "q5"]) session = askNext(skipQuestion(session, id, at));
    session = skipQuestion(session, "q6", at);
    expect(session.endedAt).toBeUndefined();

    session = endIfSkipped(session, at);
    expect(session.endedAt).toBe(at);
    expect(reportQuestionIds(session)).toEqual(["q1"]);
    expect(nextStep(session)).toEqual({ step: "evaluate", questionIds: ["q1"] });

    const scored = await evaluateAnswer(session, "q1");
    session = applyEvaluation(session, scored.evaluation);
    expect(nextStep(session)).toEqual({ step: "suggest", questionIds: ["q2", "q3", "q4", "q5", "q6"] });
    for (const id of ["q2", "q3", "q4", "q5", "q6"]) session = applySuggestion(session, (await suggestAnswer(session, id, inputs)).suggestion);

    expect(nextStep(session)).toEqual({ step: "done" });
    expect(["q2", "q3", "q4", "q5", "q6"].map((id) => evaluationFor(session, id))).toEqual([undefined, undefined, undefined, undefined, undefined]);
    expect(endedOverall(session)).toBe(sessionOverall([scored.evaluation]));
    expect(session.report).toBeUndefined();
    await expect(writeReport(session)).rejects.toThrow("A practice ended early has no overall report.");
  });

  it("ends the same way when the last question is answered after an earlier skip", () => {
    let session = askNext(skipQuestion(atFirst(), "q1", at));
    for (const id of ["q2", "q3", "q4", "q5"]) session = askNext(answerWithSample(session, id));
    // q6 is asked and waiting: not every question is done yet.
    expect(endIfSkipped(session, at)).toBe(session);
    session = endIfSkipped(answerWithSample(session, "q6"), at);
    expect(session.endedAt).toBe(at);
    expect(unansweredQuestionIds(session)).toEqual(["q1"]);
    expect(reportQuestionIds(session)).toEqual(["q2", "q3", "q4", "q5", "q6"]);
  });

  it("leaves a practice with nothing skipped on the full report, as before", async () => {
    const finished = await runMockSession(fixture);
    expect(endIfSkipped(finished, at)).toBe(finished);
    // Every question answered, before the report and the scores: still the full report's path.
    const answered = { ...finished, evaluations: [], report: undefined, summary: null };
    expect(endIfSkipped(answered, at)).toBe(answered);
    expect(nextStep(answered)).toEqual({ step: "evaluate", questionIds: ["q1", "q2", "q3", "q4", "q5", "q6"] });
  });

  it("records how many were skipped in interview.session_ended_early, with counts only", () => {
    let session = askNext(skipQuestion(atFirst(), "q1", at));
    session = askNext(answerWithSample(session, "q2"));
    session = endEarly(skipQuestion(session, "q3", at), at);
    expect(sessionEndedEarlyProperties(session)).toEqual({
      sessionId: "ready-data-analyst-sara",
      jobId: fixture.job.id,
      mode: "mock",
      questions: 6,
      answered: 1,
      skipped: 2,
    });
  });
});
