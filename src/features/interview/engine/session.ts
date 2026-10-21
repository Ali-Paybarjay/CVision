// Pure functions that build and update an InterviewSession. Used on the client and the server alike.
// Every change returns a new session; the rules of the interview (order of turns, at most one follow-up) live here.
import {
  InterviewSessionSchema,
  type AnswerEvaluation,
  type CandidateProfile,
  type FollowUpDecision,
  type InterviewReport,
  type InterviewSession,
  type InterviewTurn,
  type QuestionBlueprint,
  type ReviewChange,
  type RoleProfile,
  type StageUsage,
  type TechnicalInterviewQuestion,
} from "../contracts";
import type { StageName } from "../config";

/** Which prompt and model produced a stage's output. */
export type Provenance = { stage: StageName; prompt: string; version: string; model: string };

export class InterviewRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InterviewRuleError";
  }
}

export function createSession(options: {
  id: string;
  jobId: string;
  startedAt: string;
  mode: "mock" | "live";
}): InterviewSession {
  return {
    id: options.id,
    jobId: options.jobId,
    startedAt: options.startedAt,
    questions: [],
    answers: [],
    summary: null,
    turns: [],
    followUpDecisions: [],
    evaluations: [],
    usage: [],
    versions: { mode: options.mode, prompts: {}, models: {} },
  };
}

function record(session: InterviewSession, usage?: StageUsage, provenance?: Provenance): InterviewSession {
  const versions = session.versions ?? { mode: "mock" as const, prompts: {}, models: {} };
  return {
    ...session,
    usage: usage ? [...(session.usage ?? []), usage] : (session.usage ?? []),
    versions: provenance
      ? {
          ...versions,
          prompts: { ...versions.prompts, [provenance.prompt]: provenance.version },
          models: { ...versions.models, [provenance.stage]: provenance.model },
        }
      : versions,
  };
}

export function applyAnalysis(
  session: InterviewSession,
  result: { roleProfile: RoleProfile; candidateProfile: CandidateProfile; composition: { technical: number; behavioural: number } },
  usage?: StageUsage,
  provenance?: Provenance,
): InterviewSession {
  return record(
    {
      ...session,
      roleProfile: result.roleProfile,
      candidateProfile: result.candidateProfile,
      plan: { composition: result.composition, roleLevel: result.roleProfile.roleLevel },
    },
    usage,
    provenance,
  );
}

export function applyQuestions(
  session: InterviewSession,
  result: { blueprint: QuestionBlueprint; questions: TechnicalInterviewQuestion[]; changelog?: ReviewChange[] },
  usage?: StageUsage,
  provenance?: Provenance,
): InterviewSession {
  return record(
    {
      ...session,
      blueprint: result.blueprint,
      questions: result.questions,
      ...(result.changelog ? { reviewChangelog: result.changelog } : {}),
    },
    usage,
    provenance,
  );
}

export function turnsFor(session: InterviewSession, questionId: string): InterviewTurn[] {
  return (session.turns ?? []).filter((turn) => turn.questionId === questionId);
}

function findTurn(session: InterviewSession, questionId: string, speaker: InterviewTurn["speaker"], kind: InterviewTurn["kind"]) {
  return turnsFor(session, questionId).find((turn) => turn.speaker === speaker && turn.kind === kind);
}

export function mainAnswer(session: InterviewSession, questionId: string): string | null {
  return findTurn(session, questionId, "candidate", "main")?.text ?? null;
}

export function followUpQuestion(session: InterviewSession, questionId: string): string | null {
  return findTurn(session, questionId, "interviewer", "follow-up")?.text ?? null;
}

export function followUpAnswer(session: InterviewSession, questionId: string): string | null {
  return findTurn(session, questionId, "candidate", "follow-up")?.text ?? null;
}

export function decisionFor(session: InterviewSession, questionId: string): FollowUpDecision | undefined {
  return (session.followUpDecisions ?? []).find((decision) => decision.questionId === questionId);
}

export function evaluationFor(session: InterviewSession, questionId: string): AnswerEvaluation | undefined {
  return (session.evaluations ?? []).find((evaluation) => evaluation.questionId === questionId);
}

/** A follow-up can be asked only once per question, and only after the main answer. */
export function canAskFollowUp(session: InterviewSession, questionId: string): boolean {
  return mainAnswer(session, questionId) !== null && !findTurn(session, questionId, "interviewer", "follow-up");
}

/** A question is finished once its follow-up decision is made and, if a follow-up was asked, answered. */
export function isQuestionFinished(session: InterviewSession, questionId: string): boolean {
  const decision = decisionFor(session, questionId);
  if (!decision || mainAnswer(session, questionId) === null) return false;
  return !decision.askFollowUp || followUpAnswer(session, questionId) !== null;
}

export type SessionStep =
  | { step: "analyse" | "generate" | "review" }
  | { step: "ask"; questionId: string }
  | { step: "answer"; questionId: string; kind: InterviewTurn["kind"] }
  | { step: "decide"; questionId: string }
  | { step: "evaluate"; questionIds: string[] }
  | { step: "report" }
  | { step: "done" };

/** What the session needs next. Lets a page resume a saved session exactly where it stopped. */
export function nextStep(session: InterviewSession): SessionStep {
  if (!session.roleProfile) return { step: "analyse" };
  if (session.questions.length === 0) return { step: "generate" };
  if (!session.reviewChangelog) return { step: "review" };
  for (const question of session.questions) {
    if (isQuestionFinished(session, question.id)) continue;
    if (!findTurn(session, question.id, "interviewer", "main")) return { step: "ask", questionId: question.id };
    if (mainAnswer(session, question.id) === null) return { step: "answer", questionId: question.id, kind: "main" };
    if (!decisionFor(session, question.id)) return { step: "decide", questionId: question.id };
    return { step: "answer", questionId: question.id, kind: "follow-up" };
  }
  const unscored = session.questions.filter((q) => !evaluationFor(session, q.id)).map((q) => q.id);
  if (unscored.length) return { step: "evaluate", questionIds: unscored };
  if (!session.report) return { step: "report" };
  return { step: "done" };
}

function question(session: InterviewSession, questionId: string) {
  const found = session.questions.find((q) => q.id === questionId);
  if (!found) throw new InterviewRuleError(`Unknown question ${questionId}.`);
  return found;
}

/** The interviewer asks a question's main text. */
export function askQuestion(session: InterviewSession, questionId: string, at: string, id: string): InterviewSession {
  const asked = question(session, questionId);
  if (findTurn(session, questionId, "interviewer", "main")) return session;
  const turn: InterviewTurn = {
    id,
    questionId,
    speaker: "interviewer",
    kind: "main",
    text: asked.text,
    inputMode: "text",
    audioRef: null,
    startedAt: at,
  };
  return { ...session, turns: [...(session.turns ?? []), turn] };
}

/** The candidate answers the main question or the follow-up. */
export function addAnswer(
  session: InterviewSession,
  answer: { questionId: string; kind: InterviewTurn["kind"]; text: string; startedAt: string; submittedAt: string; id: string },
): InterviewSession {
  const { questionId, kind } = answer;
  question(session, questionId);
  if (!findTurn(session, questionId, "interviewer", kind)) {
    throw new InterviewRuleError(`The ${kind} question for ${questionId} has not been asked.`);
  }
  if (findTurn(session, questionId, "candidate", kind)) {
    throw new InterviewRuleError(`The ${kind} question for ${questionId} has already been answered.`);
  }
  const durationMs = Math.max(0, Date.parse(answer.submittedAt) - Date.parse(answer.startedAt));
  const turn: InterviewTurn = {
    id: answer.id,
    questionId,
    speaker: "candidate",
    kind,
    text: answer.text,
    inputMode: "text",
    audioRef: null,
    startedAt: answer.startedAt,
    submittedAt: answer.submittedAt,
    durationMs: Number.isFinite(durationMs) ? durationMs : 0,
  };
  const next = { ...session, turns: [...(session.turns ?? []), turn] };
  if (kind === "main") {
    // The original `answers` field mirrors the main answer for code that reads it; `turns` is the full record.
    next.answers = [...session.answers.filter((a) => a.questionId !== questionId), { questionId, text: answer.text, inputMode: "text", scores: null, feedback: null }];
  }
  return next;
}

/**
 * Records the follow-up decision and, if a follow-up is asked, adds it as a new interviewer turn.
 * Enforces the limit in code: a second follow-up on the same question is an error.
 */
export function applyFollowUpDecision(
  session: InterviewSession,
  decision: FollowUpDecision,
  at: string,
  turnId: string,
  usage?: StageUsage,
  provenance?: Provenance,
): InterviewSession {
  const { questionId } = decision;
  question(session, questionId);
  if (mainAnswer(session, questionId) === null) throw new InterviewRuleError(`${questionId} has no answer yet.`);
  if (decisionFor(session, questionId)) throw new InterviewRuleError(`${questionId} already has a follow-up decision.`);
  if (decision.askFollowUp && !canAskFollowUp(session, questionId)) {
    throw new InterviewRuleError(`${questionId} has already had its one follow-up.`);
  }
  if (decision.askFollowUp && !decision.followUpText) throw new InterviewRuleError("A follow-up needs its text.");

  let next: InterviewSession = { ...session, followUpDecisions: [...(session.followUpDecisions ?? []), decision] };
  if (decision.askFollowUp && decision.followUpText) {
    const turn: InterviewTurn = {
      id: turnId,
      questionId,
      speaker: "interviewer",
      kind: "follow-up",
      text: decision.followUpText,
      inputMode: "text",
      audioRef: null,
      startedAt: at,
    };
    next = { ...next, turns: [...(next.turns ?? []), turn] };
  }
  return record(next, usage, provenance);
}

/** Adds or replaces a question's evaluation, and mirrors its feedback into the original `answers` field. */
export function applyEvaluation(
  session: InterviewSession,
  evaluation: AnswerEvaluation,
  usage?: StageUsage,
  provenance?: Provenance,
): InterviewSession {
  question(session, evaluation.questionId);
  const evaluations = [...(session.evaluations ?? []).filter((e) => e.questionId !== evaluation.questionId), evaluation];
  const answers = session.answers.map((answer) =>
    answer.questionId === evaluation.questionId
      ? {
          ...answer,
          // AnswerScores holds the behavioural criteria; technical-v1 scores live in `evaluations`.
          scores: null,
          feedback: { strengths: evaluation.strengths, weaknesses: evaluation.weaknesses, suggestion: evaluation.improvement },
        }
      : answer,
  );
  return record({ ...session, evaluations, answers }, usage, provenance);
}

export function applyReport(session: InterviewSession, report: InterviewReport, usage?: StageUsage, provenance?: Provenance): InterviewSession {
  return record({ ...session, report, summary: report.verdict }, usage, provenance);
}

/** Questions in the order they were asked, as technical questions (every field present). */
export function technicalQuestions(session: InterviewSession): TechnicalInterviewQuestion[] {
  return session.questions as TechnicalInterviewQuestion[];
}

export function serialiseSession(session: InterviewSession): string {
  return JSON.stringify(session);
}

/** Parses a saved session and checks it against the contract. Throws if it does not match. */
export function parseSession(json: string): InterviewSession {
  return InterviewSessionSchema.parse(JSON.parse(json));
}
