import { track } from "@/shared/analytics/track";
import { getSupabaseAdmin } from "@/shared/supabase/admin";
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

/**
 * Records interview.session_completed once per session. A reload or a second tab can ask for the same report
 * again, so a session that already has the event is skipped. Two requests at the very same moment can still both
 * record it; the funnel (#44) counts distinct session ids.
 */
export async function trackSessionCompleted(session: InterviewSession, report: InterviewReport, userId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  if (admin) {
    const { count, error } = await admin
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("name", sessionCompletedEvent)
      .eq("properties->>sessionId", session.id);
    if (!error && count) return;
  }
  await track(sessionCompletedEvent, sessionCompletedProperties(session, report), { userId });
}
