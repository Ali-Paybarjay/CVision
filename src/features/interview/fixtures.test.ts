import { describe, expect, it } from "vitest";
import { JobSchema, ProfileSchema } from "@/shared/contracts";
import { TechnicalInterviewQuestionSchema } from "./contracts";
import { isLevelBelow, suggestionProblems } from "./engine/checks";
import {
  analyseOutputSchema,
  evaluateOutputSchema,
  FollowUpOutputSchema,
  generateOutputSchema,
  reportOutputSchema,
  reviewOutputSchema,
  suggestOutputSchema,
} from "./engine/schemas";
import { questionOverall } from "./engine/scoring";
import { settleFollowUp, suggestionContext, toTechnicalQuestion } from "./engine/stages";
import { fixtures } from "./fixtures";
import { endedSessionFor, inputsFor, questionSetContextFor } from "./test-support";

function issues(result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  return result.success ? [] : (result.error?.issues ?? []).map((issue) => `${issue.path.join(".")}: ${issue.message}`);
}

describe.each(fixtures)("fixture $id passes runtime validation at every stage", (fixture) => {
  const inputs = inputsFor(fixture);
  const context = questionSetContextFor(fixture);

  it("has a valid Profile and Job", () => {
    expect(() => ProfileSchema.parse(fixture.profile)).not.toThrow();
    expect(() => JobSchema.parse(fixture.job)).not.toThrow();
  });

  it("stage 1: analysis", () => {
    expect(issues(analyseOutputSchema(inputs.jobDescription, inputs.cv).safeParse(fixture.analyse))).toEqual([]);
  });

  it("stage 2: generated questions", () => {
    expect(issues(generateOutputSchema(context).safeParse(fixture.generate))).toEqual([]);
  });

  it("stage 3: reviewed questions", () => {
    expect(issues(reviewOutputSchema(context).safeParse(fixture.review))).toEqual([]);
    for (const draft of fixture.review.questions) {
      expect(TechnicalInterviewQuestionSchema.safeParse(toTechnicalQuestion(draft, context)).success).toBe(true);
    }
  });

  it("stage 3 changed something and logged it", () => {
    expect(fixture.review.changelog.length).toBeGreaterThan(0);
    for (const change of fixture.review.changelog) {
      const before = fixture.generate.questions.find((q) => q.id === change.questionId);
      const after = fixture.review.questions.find((q) => q.id === change.questionId);
      expect(before).not.toEqual(after);
    }
  });

  it("has a sample answer for every question", () => {
    expect(Object.keys(fixture.answers).sort()).toEqual(fixture.review.questions.map((q) => q.id).sort());
  });

  it.each(fixture.review.questions.map((q) => q.id))("stage 4 and 5 for %s", (questionId) => {
    const sample = fixture.answers[questionId];
    const question = toTechnicalQuestion(fixture.review.questions.find((q) => q.id === questionId)!, context);

    expect(issues(FollowUpOutputSchema.safeParse(sample.decision))).toEqual([]);
    const decision = settleFollowUp(question, sample.decision);
    expect(decision.usedFallback).toBe(false);
    expect(decision.askFollowUp).toBe(sample.followUp !== null);

    const evaluationContext = {
      lookForIds: question.lookFors.map((l) => l.id),
      mainAnswer: sample.main,
      followUpAnswer: sample.followUp,
      followUpAsked: decision.askFollowUp,
    };
    expect(issues(evaluateOutputSchema(evaluationContext).safeParse(sample.evaluation))).toEqual([]);
  });

  it("stage 6: report", () => {
    const evaluations = fixture.review.questions.map((q) => fixture.answers[q.id].evaluation);
    const lowConfidenceIds = fixture.review.questions.filter((q) => fixture.answers[q.id].evaluation.accuracyConfidence === "low").map((q) => q.id);
    const levelGap = isLevelBelow(fixture.analyse.candidateProfile.cvLevel, fixture.analyse.roleProfile.roleLevel);
    expect(issues(reportOutputSchema({ levelGap, lowConfidenceIds }).safeParse(fixture.report))).toEqual([]);
    expect(evaluations.every((e) => questionOverall(e.scores) >= 1)).toBe(true);
  });

  it.skipIf(!fixture.suggestions)("stage 7: suggested answers pass every rule, the soft ones included", () => {
    const session = endedSessionFor(fixture);
    for (const [questionId, sample] of Object.entries(fixture.suggestions ?? {})) {
      const suggestionInputs = suggestionContext(session, questionId, inputs);
      expect(issues(suggestOutputSchema(suggestionInputs).safeParse(sample)), questionId).toEqual([]);
      expect(suggestionProblems(sample, suggestionInputs), questionId).toEqual([]);
    }
  });
});

describe("the fixtures between them", () => {
  const kinds = new Set(fixtures.flatMap((f) => Object.values(f.answers).map((a) => a.kind)));

  it.each(["strong", "shallow", "technically-wrong", "dont-know", "injection"])("include a %s answer", (kind) => {
    expect(kinds.has(kind as never)).toBe(true);
  });

  it("cover three levels and include a level gap and a low-confidence evaluation", () => {
    expect(fixtures.map((f) => f.analyse.roleProfile.roleLevel)).toEqual(["L3", "L2", "L4"]);
    expect(fixtures.some((f) => isLevelBelow(f.analyse.candidateProfile.cvLevel, f.analyse.roleProfile.roleLevel))).toBe(true);
    expect(fixtures.some((f) => Object.values(f.answers).some((a) => a.evaluation.accuracyConfidence === "low"))).toBe(true);
  });

  it("use Sara's Profile and first Job from sample-data", async () => {
    const { personas } = await import("@/shared/sample-data");
    const sara = fixtures.find((f) => f.id === "data-analyst-sara");
    expect(sara?.profile).toBe(personas.sara.profile);
    expect(sara?.job).toBe(personas.sara.jobs[0]);
  });
});
