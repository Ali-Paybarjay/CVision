// What the main interview API and the lab API share: the session check on every request, and turning an engine
// failure into a response. Both run one engine step per POST.
import { AskModelError } from "@/shared/ai";
import { limits } from "../config";
import { InterviewSessionSchema } from "../contracts";
import { MockFixtureMissingError } from "../engine/mock";
import { InterviewRuleError } from "../engine/session";
import { InterviewStageError, questionsNotWritten } from "../engine/stages";

/**
 * A session sent by the browser. Everything in it reaches a prompt, so answers have a length limit and the whole
 * session has a size limit: the daily limit counts requests, not their size.
 */
export const RequestSessionSchema = InterviewSessionSchema.refine(
  (session) =>
    session.answers.every((a) => a.text.length <= limits.answerMaxChars) &&
    (session.turns ?? []).every((t) => t.speaker !== "candidate" || t.text.length <= limits.answerMaxChars),
  { message: `An answer is longer than ${limits.answerMaxChars} characters.` },
).refine((session) => JSON.stringify(session).length <= limits.sessionMaxChars, {
  message: `The session is longer than ${limits.sessionMaxChars} characters.`,
});

/** The 400 for a body that matches no step. */
export function badRequest(issues: { code: string; message: string }[]): Response {
  const tooLong = issues.some((issue) => issue.code === "too_big" || issue.message.includes("longer than"));
  const error = tooLong ? "The job ad, CV or an answer is too long." : "The request did not match any interview step.";
  return Response.json({ error }, { status: 400 });
}

const secondGo = "Try again: it usually works on the second go.";

/** What the user sees when a step's answer broke a rule twice, by step. */
const plainMessages: Record<string, string> = {
  analyse: questionsNotWritten,
  generate: questionsNotWritten,
  review: questionsNotWritten,
  evaluate: `We could not score this answer this time. ${secondGo}`,
  report: `We could not write your report this time. ${secondGo}`,
};

/**
 * The response for a step that threw. Logs the kind of failure, and for an invalid answer the rules it broke (their
 * messages name the field and the rule, never the CV, the job description or an answer). With `plain`, a step whose
 * answer broke a rule twice shows a plain message, not the rule (#220).
 */
export function stepFailed(source: string, step: string, error: unknown, { plain = false } = {}): Response {
  const reason = error instanceof AskModelError ? error.reason : undefined;
  const rules = reason === "invalid-answer" ? `: ${(error as Error).message}` : "";
  console.error(`${source}: ${step} failed (${error instanceof Error ? error.name : "unknown"}${reason ? `, ${reason}` : ""})${rules}`);
  if (plain && reason === "invalid-answer") {
    return Response.json({ error: plainMessages[step] ?? `We could not finish this step this time. ${secondGo}` }, { status: 422 });
  }
  const known =
    error instanceof AskModelError ||
    error instanceof MockFixtureMissingError ||
    error instanceof InterviewStageError ||
    error instanceof InterviewRuleError;
  return Response.json({ error: known ? (error as Error).message : `The ${step} step failed. Try again.` }, { status: known ? 422 : 500 });
}
