import type { InterviewReport, InterviewSession } from "../contracts";
import { countWords } from "../engine/text";

export const sessionCompletedEvent = "interview.session_completed";

/**
 * The details of interview.session_completed: counts, scores and timing only.
 * Never the questions, the answers, the CV or the job ad (CLAUDE.md, usage events).
 */
export function sessionCompletedProperties(session: InterviewSession, report: InterviewReport) {
  const answers = (session.turns ?? []).filter((turn) => turn.speaker === "candidate");
  const lastSubmitted = Math.max(...answers.map((turn) => (turn.submittedAt ? Date.parse(turn.submittedAt) : 0)), 0);
  const words = answers.filter((turn) => turn.kind === "main").map((turn) => countWords(turn.text));
  return {
    sessionId: session.id,
    jobId: session.jobId,
    mode: session.versions?.mode ?? "mock",
    questions: session.questions.length,
    followUpsAsked: (session.followUpDecisions ?? []).filter((decision) => decision.askFollowUp).length,
    overall: report.overall,
    readiness: report.readiness,
    lowConfidenceAnswers: report.uncertaintyNotes.length,
    averageAnswerWords: words.length ? Math.round(words.reduce((sum, n) => sum + n, 0) / words.length) : 0,
    durationSeconds: lastSubmitted ? Math.max(0, Math.round((lastSubmitted - Date.parse(session.startedAt)) / 1000)) : null,
  };
}
