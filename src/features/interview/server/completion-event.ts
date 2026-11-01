import { track } from "@/shared/analytics/track";
import { getSupabaseAdmin } from "@/shared/supabase/admin";
import type { InterviewReport, InterviewSession } from "../contracts";
import { reportQuestionIds } from "../engine/session";
import { countWords } from "../engine/text";

export const sessionCompletedEvent = "interview.session_completed";
export const sessionEndedEarlyEvent = "interview.session_ended_early";

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

/** The details of interview.session_ended_early (#205): counts only, never text. */
export function sessionEndedEarlyProperties(session: InterviewSession) {
  return {
    sessionId: session.id,
    jobId: session.jobId,
    mode: session.versions?.mode ?? "mock",
    questions: session.questions.length,
    answered: reportQuestionIds(session).length,
  };
}

/**
 * Records an event once per session. A reload or a second tab can send the same step again, so a session that
 * already has the event is skipped. Two requests at the very same moment can still both record it; the funnel
 * (#44) counts distinct session ids.
 */
async function trackOncePerSession(name: string, properties: { sessionId: string }, userId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  if (admin) {
    const { count, error } = await admin
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("name", name)
      .eq("properties->>sessionId", properties.sessionId);
    if (!error && count) return;
  }
  await track(name, properties, { userId });
}

export async function trackSessionCompleted(session: InterviewSession, report: InterviewReport, userId: string): Promise<void> {
  await trackOncePerSession(sessionCompletedEvent, sessionCompletedProperties(session, report), userId);
}

export async function trackSessionEndedEarly(session: InterviewSession, userId: string): Promise<void> {
  await trackOncePerSession(sessionEndedEarlyEvent, sessionEndedEarlyProperties(session), userId);
}
