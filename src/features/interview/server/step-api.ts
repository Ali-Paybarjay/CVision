// What the main interview API and the lab API share: the session check on every request, and turning an engine
// failure into a response. Both run one engine step per POST.
import { AskModelError } from "@/shared/ai";
import { limits } from "../config";
import { InterviewSessionSchema } from "../contracts";
import { MockFixtureMissingError } from "../engine/mock";
import { InterviewRuleError } from "../engine/session";
import { InterviewStageError } from "../engine/stages";

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

/** The response for a step that threw. Logs the kind of failure only: never the CV, the job description or an answer. */
export function stepFailed(source: string, step: string, error: unknown): Response {
  const reason = error instanceof AskModelError ? error.reason : undefined;
  console.error(`${source}: ${step} failed (${error instanceof Error ? error.name : "unknown"}${reason ? `, ${reason}` : ""})`);
  const known =
    error instanceof AskModelError ||
    error instanceof MockFixtureMissingError ||
    error instanceof InterviewStageError ||
    error instanceof InterviewRuleError;
  return Response.json({ error: known ? (error as Error).message : `The ${step} step failed. Try again.` }, { status: known ? 422 : 500 });
}
