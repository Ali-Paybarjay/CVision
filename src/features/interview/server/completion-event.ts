import { track } from "@/shared/analytics/track";
import { getSupabaseAdmin } from "@/shared/supabase/admin";
import type { InterviewReport, InterviewSession } from "../contracts";
import { reportQuestionIds } from "../engine/session";
import { countWords } from "../engine/text";

export const sessionCompletedEvent = "interview.session_completed";
export const sessionEndedEarlyEvent = "interview.session_ended_early";
export const startupReadyEvent = "interview.startup_ready";

/** A start whose wait before the check is longer than this was left and resumed later: no total is recorded for it. */
const resumedAfterMs = 15 * 60_000;

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

/** How long the start took, as the review step's request reports it (#232, #266). */
export type StartupTiming = { waitedMs?: number; analyseMs?: number; generateMs?: number; retries?: number; reviewMs: number };

/** Milliseconds as whole seconds, or null when the browser did not send them. */
const secondsOrNull = (ms: number | undefined) => (ms === undefined ? null : Math.round(ms / 1000));

/**
 * The details of interview.startup_ready (#232): how long the user waited from "Start practice" to question 1, in
 * seconds, so the wait the page promises comes from real starts. `waitedMs` is the browser's own count up to the check
 * (stage 3), `reviewMs` the check itself on the server. `analyseMs` and `generateMs` are stages 1 and 2 in the browser,
 * their last go only (#266), so each stage's share of the bar can come from real starts too. Durations only, never text.
 */
export function startupReadyProperties(session: InterviewSession, timing: StartupTiming) {
  const resumed = timing.waitedMs !== undefined && timing.waitedMs > resumedAfterMs;
  return {
    sessionId: session.id,
    jobId: session.jobId,
    mode: session.versions?.mode ?? "mock",
    seconds: timing.waitedMs === undefined || resumed ? null : Math.round((timing.waitedMs + timing.reviewMs) / 1000),
    analyseSeconds: secondsOrNull(timing.analyseMs),
    generateSeconds: secondsOrNull(timing.generateMs),
    reviewSeconds: Math.round(timing.reviewMs / 1000),
    retries: timing.retries ?? 0,
    resumed,
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

/** Once per session: a reload during the check sends it again. */
export async function trackStartupReady(session: InterviewSession, timing: StartupTiming, userId: string): Promise<void> {
  await trackOncePerSession(startupReadyEvent, startupReadyProperties(session, timing), userId);
}
