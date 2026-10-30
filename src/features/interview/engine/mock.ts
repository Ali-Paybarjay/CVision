// Samples for askModel in mock mode. askModel returns `sample` unchanged in mock mode (and checks it against the
// same schema as live mode), so a session runs end to end on the fixtures. Typed answers that are not fixture
// samples get a simple deterministic output that quotes the typed text, so the same checks still pass.
import type { InterviewSession, TechnicalInterviewQuestion } from "../contracts";
import { fixtureForJob, fixtures } from "../fixtures";
import type { InterviewFixture, SampleAnswer } from "../fixtures/types";
import type { EvaluateOutput, FollowUpOutput, ReportOutput, SuggestOutput } from "./schemas";
import { readinessLabels } from "./scoring";
import { countWords, firstWords, isNonAnswer } from "./text";
import { answerGuide } from "../config";
import { evaluationFor, followUpAnswer, followUpQuestion, mainAnswer } from "./session";

export class MockFixtureMissingError extends Error {
  constructor() {
    super("Mock mode only has outputs for the three interview fixtures. Pick a fixture, or set AI_MODE=live.");
    this.name = "MockFixtureMissingError";
  }
}

/** The fixture for a job in mock mode. Throws for any other job. */
export function requireFixture(jobId: string): InterviewFixture {
  const fixture = fixtureForJob(jobId);
  if (!fixture) throw new MockFixtureMissingError();
  return fixture;
}

/** In live mode askModel ignores `sample`, but still needs one of the right type. */
export function fixtureOrPlaceholder(jobId: string): InterviewFixture {
  return fixtureForJob(jobId) ?? fixtures[0];
}

function same(a: string | null, b: string | null): boolean {
  return (a ?? "").trim() === (b ?? "").trim();
}

/** The fixture's sample for this question when the candidate submitted exactly its main answer. */
export function matchingSample(jobId: string, questionId: string, main: string): SampleAnswer | undefined {
  const sample = fixtureForJob(jobId)?.answers[questionId];
  return sample && same(sample.main, main) ? sample : undefined;
}

export function mockFollowUpDecision(question: TechnicalInterviewQuestion, jobId: string, main: string): FollowUpOutput {
  const sample = matchingSample(jobId, question.id, main);
  if (sample) return sample.decision;

  if (isNonAnswer(main)) {
    return { askFollowUp: false, gapType: "none", plannedFollowUpId: null, followUpText: null, reason: "Mock decision: no genuine attempt, so moving on." };
  }
  if (countWords(main) < answerGuide.minWords) {
    const planned = question.followUps.find((f) => f.gapType === "missing-specifics") ?? question.followUps[0];
    return {
      askFollowUp: true,
      gapType: planned.gapType,
      plannedFollowUpId: planned.id,
      followUpText: planned.text,
      reason: `Mock decision: the answer is under ${answerGuide.minWords} words, so the planned follow-up is asked.`,
    };
  }
  return { askFollowUp: false, gapType: "none", plannedFollowUpId: null, followUpText: null, reason: "Mock decision: the answer is long enough to move on." };
}

/** Evaluation sample: the fixture's when both answers are the fixture's, otherwise a placeholder that quotes the typed text. */
export function mockEvaluation(session: InterviewSession, question: TechnicalInterviewQuestion): EvaluateOutput {
  const main = mainAnswer(session, question.id) ?? "";
  const followUp = followUpAnswer(session, question.id);
  const asked = followUpQuestion(session, question.id) !== null;
  const sample = matchingSample(session.jobId, question.id, main);
  if (sample && (asked ? sample.decision.askFollowUp && same(sample.followUp, followUp) : !sample.decision.askFollowUp)) {
    return sample.evaluation;
  }

  const blank = isNonAnswer(main) && (followUp === null || isNonAnswer(followUp));
  const quoteSource = !isNonAnswer(main) ? main : (followUp ?? "");
  const note = "Mock evaluation: a fixed placeholder score, not an assessment.";
  return {
    lookForEvidence: question.lookFors.map((lookFor, i) =>
      i === 0 && !blank
        ? { lookForId: lookFor.id, status: "partial", quote: firstWords(quoteSource, 12) }
        : { lookForId: lookFor.id, status: "missing", quote: null },
    ),
    errors: [],
    accuracyConfidence: "medium",
    scores: blank
      ? { technicalAccuracy: 1, depthOfReasoning: 1, appliedEvidence: 1, clarity: 1 }
      : { technicalAccuracy: 3, depthOfReasoning: 2, appliedEvidence: 2, clarity: 3 },
    justifications: { technicalAccuracy: note, depthOfReasoning: note, appliedEvidence: note, clarity: note },
    strengths: [],
    weaknesses: ["Mock mode does not assess typed answers; use a sample answer or switch to live mode."],
    improvement: "Run this question in live mode (AI_MODE=live) for real feedback on your answer.",
    strongerAnswerOutline: question.lookFors.slice(0, 5).map((lookFor) => `Cover this point: ${lookFor.text}`),
    followUpClosedGap: asked ? false : null,
  };
}

/** The fixture's suggested answer for a question, when it has one. Without one, mock mode uses the code-built version. */
export function mockSuggestion(jobId: string, questionId: string): SuggestOutput | undefined {
  return fixtureForJob(jobId)?.suggestions?.[questionId];
}

/** True when every evaluation in the session came from a fixture sample, so the fixture's report fits it. */
function allFromSamples(session: InterviewSession, fixture: InterviewFixture): boolean {
  return session.questions.every((q) => {
    const evaluation = evaluationFor(session, q.id);
    const sample = fixture.answers[q.id];
    return Boolean(evaluation && sample && JSON.stringify(sample.evaluation.scores) === JSON.stringify(evaluation.scores) && same(sample.main, mainAnswer(session, q.id)));
  });
}

export function mockReport(
  session: InterviewSession,
  computed: { overall: number; readiness: keyof typeof readinessLabels; levelGap: boolean; lowConfidenceIds: string[] },
): ReportOutput {
  const fixture = fixtureForJob(session.jobId);
  if (fixture && allFromSamples(session, fixture)) return fixture.report;

  const weakest = [...(session.evaluations ?? [])].sort((a, b) => a.overall - b.overall).slice(0, 3);
  const position = (id: string) => session.questions.findIndex((q) => q.id === id) + 1;
  const role = session.roleProfile;
  const candidate = session.candidateProfile;
  return {
    verdict: `Mock report: overall ${computed.overall} out of 5, ${readinessLabels[computed.readiness].toLowerCase()}. Switch to live mode for a written verdict.`,
    priorities: weakest.map((evaluation) => ({
      title: `Strengthen your answer to question ${position(evaluation.questionId)}`,
      detail: evaluation.improvement,
    })),
    levelGapNote:
      computed.levelGap && role && candidate
        ? `Mock report: your CV shows ${candidate.cvLevel} and this role asks for ${role.roleLevel}. Prepare examples that show work at the role's level.`
        : null,
    uncertaintyNotes: computed.lowConfidenceIds.map((questionId) => ({
      questionId,
      note: `Mock report: the accuracy of question ${position(questionId)} could not be judged with confidence. Check it with a practitioner.`,
    })),
  };
}
