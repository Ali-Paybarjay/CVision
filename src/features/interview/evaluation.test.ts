import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { describe, expect, it } from "vitest";
import {
  AnalyseOutputSchema,
  EvaluateOutputSchema,
  evaluateOutputSchema,
  FollowUpOutputSchema,
  GenerateOutputSchema,
  ReportOutputSchema,
  ReviewOutputSchema,
  SuggestOutputSchema,
  analyseOutputSchema,
  generateOutputSchema,
  reportOutputSchema,
  reviewOutputSchema,
  suggestOutputSchema,
} from "./engine/schemas";
import { evaluationProblems, isLengthProblem } from "./engine/checks";
import { competencyMap, questionOverall, readinessFor, sessionOverall } from "./engine/scoring";
import { suggestionContext } from "./engine/stages";
import { isVerbatim } from "./engine/text";
import { mainAnswer, followUpAnswer } from "./engine/session";
import { fixtures } from "./fixtures";
import { managementAccountant } from "./fixtures/management-accountant";
import { processEngineer } from "./fixtures/process-engineer";
import { endedSessionFor, inputsFor, questionSetContextFor, runMockSession } from "./test-support";

describe("scores", () => {
  it.each(fixtures.flatMap((f) => Object.entries(f.answers).map(([id, a]) => [`${f.id} ${id}`, a.evaluation.scores] as const)))(
    "%s: every score is an integer from 1 to 5",
    (_, scores) => {
      for (const value of Object.values(scores)) {
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(1);
        expect(value).toBeLessThanOrEqual(5);
      }
    },
  );

  it("rejects a score outside 1 to 5 or a fraction", () => {
    const base = processEngineer.answers.q1.evaluation;
    const context = { lookForIds: ["q1-l1", "q1-l2", "q1-l3", "q1-l4"], mainAnswer: processEngineer.answers.q1.main, followUpAnswer: null, followUpAsked: false };
    expect(evaluateOutputSchema(context).safeParse({ ...base, scores: { ...base.scores, clarity: 6 } }).success).toBe(false);
    expect(evaluateOutputSchema(context).safeParse({ ...base, scores: { ...base.scores, clarity: 3.5 } }).success).toBe(false);
  });
});

describe("overall score", () => {
  it.each([
    [{ technicalAccuracy: 5, depthOfReasoning: 4, appliedEvidence: 5, clarity: 4 }, 4.5],
    [{ technicalAccuracy: 4, depthOfReasoning: 3, appliedEvidence: 4, clarity: 4 }, 3.8],
    [{ technicalAccuracy: 3, depthOfReasoning: 3, appliedEvidence: 3, clarity: 4 }, 3.3],
    [{ technicalAccuracy: 1, depthOfReasoning: 1, appliedEvidence: 1, clarity: 1 }, 1],
    // Accuracy of 2 or below caps the overall at 2.5, however good the rest is.
    [{ technicalAccuracy: 2, depthOfReasoning: 5, appliedEvidence: 5, clarity: 5 }, 2.5],
    [{ technicalAccuracy: 1, depthOfReasoning: 5, appliedEvidence: 5, clarity: 4 }, 2.5],
    [{ technicalAccuracy: 2, depthOfReasoning: 2, appliedEvidence: 2, clarity: 3 }, 2.3],
    [{ technicalAccuracy: 3, depthOfReasoning: 5, appliedEvidence: 5, clarity: 5 }, 4.5],
  ])("%o gives %d", (scores, expected) => {
    expect(questionOverall(scores)).toBe(expected);
  });

  it("averages the questions and sets the readiness label", () => {
    expect(sessionOverall([{ overall: 4.5 }, { overall: 3.5 }])).toBe(4);
    expect(readinessFor(4)).toBe("ready");
    expect(readinessFor(3.9)).toBe("nearly-ready");
    expect(readinessFor(3)).toBe("nearly-ready");
    expect(readinessFor(2.9)).toBe("not-yet-ready");
  });
});

describe("evidence quotes", () => {
  it.each(fixtures.flatMap((f) => Object.entries(f.answers).map(([id, a]) => [`${f.id} ${id}`, a] as const)))(
    "%s: every quote is a verbatim substring of the answer",
    (_, answer) => {
      const source = [answer.main, answer.followUp ?? ""].join("\n");
      for (const entry of answer.evaluation.lookForEvidence) {
        if (entry.quote === null) continue;
        expect(source.includes(entry.quote)).toBe(true);
      }
    },
  );

  it("rejects a quote that is not in the answer", () => {
    const sample = processEngineer.answers.q1;
    const context = { lookForIds: ["q1-l1", "q1-l2", "q1-l3", "q1-l4"], mainAnswer: sample.main, followUpAnswer: null, followUpAsked: false };
    const invented = {
      ...sample.evaluation,
      lookForEvidence: sample.evaluation.lookForEvidence.map((e, i) => (i === 0 ? { ...e, quote: "I ran a full hazard study on the new profile" } : e)),
    };
    const result = evaluateOutputSchema(context).safeParse(invented);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).not.toContain(sample.main.slice(0, 40));
  });

  it("gives typed answers in mock mode a placeholder evaluation that quotes the typed text", async () => {
    const typed = "I would start from the batch records and the heat balance, then trial a change with the operations team.";
    const session = await runMockSession(processEngineer, () => ({ main: typed, followUp: "I would compare twenty batches before and after." }));
    for (const evaluation of session.evaluations ?? []) {
      const source = [mainAnswer(session, evaluation.questionId), followUpAnswer(session, evaluation.questionId)].join("\n");
      for (const entry of evaluation.lookForEvidence) {
        if (entry.quote) expect(isVerbatim(entry.quote, source)).toBe(true);
      }
    }
    expect(session.report?.verdict).toContain("Mock report");
  });
});

describe("report", () => {
  it("is computed from the evaluations, never re-scored", async () => {
    const session = await runMockSession(managementAccountant);
    const evaluations = session.evaluations ?? [];
    expect(session.report?.overall).toBe(sessionOverall(session.questions.map((q) => evaluations.find((e) => e.questionId === q.id)!)));
    expect(session.report?.competencyMap).toEqual(competencyMap(session.roleProfile!, session.questions, evaluations));
    expect(session.report?.uncertaintyNotes.map((n) => n.questionId)).toEqual(["q4"]);
  });
});

describe("structured output formats", () => {
  const fixture = fixtures[0];
  const context = questionSetContextFor(fixture);
  it.each([
    ["analyse", AnalyseOutputSchema],
    ["analyse (with checks)", analyseOutputSchema(context.jobDescription, context.cv)],
    ["generate", GenerateOutputSchema],
    ["generate (with checks)", generateOutputSchema(context)],
    ["review", ReviewOutputSchema],
    ["review (with checks)", reviewOutputSchema(context)],
    ["follow-up", FollowUpOutputSchema],
    ["evaluate", EvaluateOutputSchema],
    ["evaluate (with checks)", evaluateOutputSchema({ lookForIds: [], mainAnswer: "", followUpAnswer: null, followUpAsked: false })],
    ["report", ReportOutputSchema],
    ["report (with checks)", reportOutputSchema({ levelGap: false, lowConfidenceIds: [] })],
    ["suggest", SuggestOutputSchema],
    ["suggest (with checks)", suggestOutputSchema(suggestionContext(endedSessionFor(fixture), "q1", inputsFor(fixture)))],
  ])("%s converts to a JSON schema for live mode", (_, schema) => {
    expect(() => zodOutputFormat(schema)).not.toThrow();
  });
});

describe("length rules are soft", () => {
  const base = processEngineer.answers.q1.evaluation;
  const context = { lookForIds: base.lookForEvidence.map((e) => e.lookForId), mainAnswer: processEngineer.answers.q1.main, followUpAnswer: null, followUpAsked: false };
  const long = "Name the alarm. Say who you told. Give the figure. Explain the fix.";

  it("keeps an over-long improvement out of the schema, so askModel does not fail the session over it", () => {
    expect(evaluateOutputSchema(context).safeParse({ ...base, improvement: long }).success).toBe(true);
  });

  it("still finds the broken length rule, so the stage can record it", () => {
    const rules = evaluationProblems({ ...base, improvement: long }, context).filter(isLengthProblem).map((p) => p.lengthRule);
    expect(rules).toEqual(["improvement-length"]);
  });

  it("still rejects a quote that is not in the answer", () => {
    const covered = base.lookForEvidence.findIndex((e) => e.status !== "missing");
    const lookForEvidence = base.lookForEvidence.map((e, i) => (i === covered ? { ...e, quote: "words the candidate never said" } : e));
    expect(evaluateOutputSchema(context).safeParse({ ...base, lookForEvidence }).success).toBe(false);
  });
});
