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

/** The AI service turned the request away, or no key is set: Try again now would only fail the same way. */
export const practiceUnavailable = "Interview practice is not available right now. Please try again later.";

/** The model declined the step: said plainly, never with the model's feature name. */
export const stepDeclined = "We could not finish this step. Try again; if it happens again, try another job.";

/**
 * The HTTP status the AI service answered with, when it answered at all. The SDK's API errors carry one and reach
 * here unchanged (askModel); a dropped connection has none.
 */
function serviceStatus(error: unknown): number | undefined {
  const status = error instanceof Error ? (error as { status?: unknown }).status : undefined;
  return typeof status === "number" && status >= 400 && status < 600 ? status : undefined;
}

/** A busy or failing AI service may well answer a moment later; one that turned the request away will not. */
const isBusy = (status: number) => status >= 500 || status === 429 || status === 408;

/**
 * The response for a step that threw. Logs the kind of failure, and for an invalid answer the rules it broke (their
 * messages name the field and the rule, never the CV, the job description or an answer). With `plain`, the user's page
 * gets plain words, not the rule or the model's message (#220, #266).
 *
 * `retryable: true` tells the page a second go may well work (#232): an answer that broke a rule twice, a dropped
 * connection, or the AI service busy or failing (5xx, 429). `final: true` tells it that Try again now would only fail
 * the same way (#266): a daily limit, or the AI service turning the request away (400, 401, 402 out of credit, 403), so
 * the page offers no Try again. A refusal or a rule of the interview itself is neither: no second go by itself, but the
 * user may try again.
 */
export function stepFailed(source: string, step: string, error: unknown, { plain = false } = {}): Response {
  const reason = error instanceof AskModelError ? error.reason : undefined;
  const status = reason ? undefined : serviceStatus(error);
  const rules = reason === "invalid-answer" ? `: ${(error as Error).message}` : "";
  const detail = reason ?? (status !== undefined ? `HTTP ${status}` : undefined);
  console.error(`${source}: ${step} failed (${error instanceof Error ? error.name : "unknown"}${detail ? `, ${detail}` : ""})${rules}`);
  const message = error instanceof Error ? error.message : "";
  // Plain words on the user's page; the lab names the step.
  const notThisTime = plain ? (plainMessages[step] ?? `We could not finish this step this time. ${secondGo}`) : `The ${step} step failed. Try again.`;

  switch (reason) {
    case "invalid-answer":
      return Response.json({ error: plain ? notThisTime : message, retryable: true }, { status: 422 });
    case "limit-reached":
      return Response.json({ error: message, final: true }, { status: 429 });
    case "no-api-key":
      return Response.json({ error: plain ? practiceUnavailable : message, final: true }, { status: 503 });
    case "refused":
      return Response.json({ error: plain ? stepDeclined : message }, { status: 422 });
  }
  if (status !== undefined && !isBusy(status)) {
    return Response.json({ error: plain ? practiceUnavailable : `The ${step} step failed: the AI service answered ${status}.`, final: true }, { status: 503 });
  }
  const known = error instanceof MockFixtureMissingError || error instanceof InterviewStageError || error instanceof InterviewRuleError;
  if (known) return Response.json({ error: message }, { status: 422 });
  return Response.json({ error: notThisTime, retryable: true }, { status: 500 });
}
