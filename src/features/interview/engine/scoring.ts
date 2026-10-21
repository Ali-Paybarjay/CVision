// Every number in the report is computed here, in code, never by the model.
import { readinessThresholds } from "../config";
import type { AnswerEvaluation, InterviewQuestion, InterviewReport, RoleProfile, TechnicalScores } from "../contracts";

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Mean of the four scores to one decimal; capped at 2.5 when technical accuracy is 2 or below. */
export function questionOverall(scores: TechnicalScores): number {
  const mean = (scores.technicalAccuracy + scores.depthOfReasoning + scores.appliedEvidence + scores.clarity) / 4;
  const overall = roundToOneDecimal(mean);
  return scores.technicalAccuracy <= 2 ? Math.min(overall, 2.5) : overall;
}

/** Mean of the question scores to one decimal. */
export function sessionOverall(evaluations: Pick<AnswerEvaluation, "overall">[]): number {
  if (evaluations.length === 0) throw new Error("No evaluations to aggregate.");
  return roundToOneDecimal(evaluations.reduce((sum, e) => sum + e.overall, 0) / evaluations.length);
}

export function readinessFor(overall: number): InterviewReport["readiness"] {
  if (overall >= readinessThresholds.ready) return "ready";
  if (overall >= readinessThresholds.nearlyReady) return "nearly-ready";
  return "not-yet-ready";
}

export const readinessLabels: Record<InterviewReport["readiness"], string> = {
  ready: "Ready",
  "nearly-ready": "Nearly ready",
  "not-yet-ready": "Not yet ready",
};

/** Each JD competency: strong (4.0+), adequate (3.0 to 3.9), gap (below 3.0) or not assessed by any question. */
export function competencyMap(
  roleProfile: RoleProfile,
  questions: InterviewQuestion[],
  evaluations: AnswerEvaluation[],
): InterviewReport["competencyMap"] {
  return roleProfile.competencies.map((competency) => {
    const questionIds = questions.filter((q) => q.competencyId === competency.id).map((q) => q.id);
    const scored = evaluations.filter((e) => questionIds.includes(e.questionId));
    if (scored.length === 0) return { competencyId: competency.id, status: "not-assessed" as const, questionIds };
    const mean = roundToOneDecimal(scored.reduce((sum, e) => sum + e.overall, 0) / scored.length);
    const status = mean >= readinessThresholds.ready ? "strong" : mean >= readinessThresholds.nearlyReady ? "adequate" : "gap";
    return { competencyId: competency.id, status, questionIds };
  });
}
