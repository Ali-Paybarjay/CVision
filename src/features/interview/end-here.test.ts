// "End here" (#205) from start to finish in mock mode: the steps after End, the stages that refuse to run, and the
// event's details. The suggested answers themselves are tested in suggest.test.ts.
import { describe, expect, it } from "vitest";
import {
  addAnswer,
  applyEvaluation,
  applyFollowUpDecision,
  applySuggestion,
  askQuestion,
  endEarly,
  nextStep,
  reportQuestionIds,
} from "./engine/session";
import { evaluateAnswer, suggestAnswer, writeReport } from "./engine/stages";
import { dataAnalystSara as fixture } from "./fixtures/data-analyst-sara";
import { sessionEndedEarlyProperties } from "./server/completion-event";
import { inputsFor, readySessionFor } from "./test-support";

const at = "2026-10-21T09:00:00.000Z";
const later = "2026-10-21T09:10:00.000Z";
const inputs = inputsFor(fixture);
const noFollowUp = (questionId: string) => ({ questionId, askFollowUp: false, gapType: "none" as const, usedFallback: false, reason: "Moving on." });

/** Sara answers q1 with "I don't know" and q2 properly, then ends at q3. */
function endedAfterTwo() {
  let session = askQuestion(readySessionFor(fixture), "q1", at, "t1");
  session = addAnswer(session, { questionId: "q1", kind: "main", text: "I don't know", startedAt: at, submittedAt: at, id: "t2" });
  session = applyFollowUpDecision(session, noFollowUp("q1"), at, "t3");
  session = askQuestion(session, "q2", at, "t4");
  session = addAnswer(session, { questionId: "q2", kind: "main", text: fixture.answers.q2.main, startedAt: at, submittedAt: at, id: "t5" });
  session = applyFollowUpDecision(session, noFollowUp("q2"), at, "t6");
  session = askQuestion(session, "q3", at, "t7");
  return endEarly(session, later);
}

describe("after 'End here'", () => {
  it("scores the answered questions, writes the suggested answers, and needs no overall report", async () => {
    let session = endedAfterTwo();
    expect(reportQuestionIds(session)).toEqual(["q2"]);
    expect(nextStep(session)).toEqual({ step: "evaluate", questionIds: ["q2"] });

    const scored = await evaluateAnswer(session, "q2");
    session = applyEvaluation(session, scored.evaluation, scored.usage, scored.provenance);
    expect(nextStep(session)).toEqual({ step: "suggest", questionIds: ["q1", "q3", "q4", "q5", "q6"] });

    for (const id of ["q1", "q3", "q4", "q5", "q6"]) {
      const { suggestion, usage, provenance } = await suggestAnswer(session, id, inputs);
      session = applySuggestion(session, suggestion, usage, provenance);
    }
    expect(nextStep(session)).toEqual({ step: "done" });
    expect(session.report).toBeUndefined();
  });

  it("scores every question, as before, while the practice has not ended", () => {
    expect(reportQuestionIds(readySessionFor(fixture))).toEqual(["q1", "q2", "q3", "q4", "q5", "q6"]);
  });

  it("refuses to score an unanswered question or to write the overall report", async () => {
    const session = endedAfterTwo();
    await expect(evaluateAnswer(session, "q1")).rejects.toThrow("q1 was not answered");
    await expect(writeReport(session)).rejects.toThrow("A practice ended early has no overall report.");
  });

  it("records counts only in interview.session_ended_early", () => {
    const properties = sessionEndedEarlyProperties(endedAfterTwo());
    expect(properties).toEqual({ sessionId: "ready-data-analyst-sara", jobId: fixture.job.id, mode: "mock", questions: 6, answered: 1 });
    expect(JSON.stringify(properties)).not.toContain(fixture.answers.q2.main.slice(0, 30));
  });
});
