// The interview lab's API: one POST per engine step. A Route Handler rather than Server Actions, because the
// client dispatches Server Actions one at a time and answers are scored in the background while the interview goes on.
import { z } from "zod";
import { AskModelError, getAiMode, type Requester } from "@/shared/ai";
import { getCurrentUser } from "@/features/account/current-user";
import { limits } from "@/features/interview/config";
import { InterviewSessionSchema as FullSessionSchema } from "@/features/interview/contracts";
import { MockFixtureMissingError } from "@/features/interview/engine/mock";
import { InterviewInputsSchema } from "@/features/interview/engine/schemas";
import { InterviewRuleError } from "@/features/interview/engine/session";
import {
  analyseStep,
  decideFollowUp,
  evaluateAnswer,
  generateStep,
  InterviewStageError,
  reviewStep,
  writeReport,
} from "@/features/interview/engine/stages";
import { isLabEnabled } from "../lab-access";

// Answers are added in the browser and arrive inside the session, so their length is checked here.
const InterviewSessionSchema = FullSessionSchema.refine(
  (session) =>
    session.answers.every((a) => a.text.length <= limits.answerMaxChars) &&
    (session.turns ?? []).every((t) => t.speaker !== "candidate" || t.text.length <= limits.answerMaxChars),
  { message: `An answer is longer than ${limits.answerMaxChars} characters.` },
);

const RequestSchema = z.discriminatedUnion("step", [
  z.object({ step: z.literal("analyse"), inputs: InterviewInputsSchema, id: z.string().min(1), startedAt: z.iso.datetime() }),
  z.object({ step: z.literal("generate"), inputs: InterviewInputsSchema, session: InterviewSessionSchema }),
  z.object({ step: z.literal("review"), inputs: InterviewInputsSchema, session: InterviewSessionSchema }),
  z.object({ step: z.literal("follow-up"), session: InterviewSessionSchema, questionId: z.string().min(1) }),
  z.object({ step: z.literal("evaluate"), session: InterviewSessionSchema, questionId: z.string().min(1) }),
  z.object({ step: z.literal("report"), session: InterviewSessionSchema }),
]);

export async function POST(request: Request): Promise<Response> {
  if (!isLabEnabled()) return new Response("Not found", { status: 404 });

  // Live requests spend the team's credit, so they need a signed-in user and count towards that user's daily limit.
  // Mock requests cost nothing and stay open, so the lab works locally without an account.
  let requester: Requester | undefined;
  if (getAiMode() === "live") {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Sign in to use the interview lab in live mode." }, { status: 401 });
    requester = { userId: user.id };
  }

  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const tooLong = parsed.error.issues.some((issue) => issue.code === "too_big" || issue.message.includes("longer than"));
    const error = tooLong ? "The job ad, CV or an answer is too long." : "The request did not match any interview step.";
    return Response.json({ error }, { status: 400 });
  }
  const body = parsed.data;

  try {
    switch (body.step) {
      case "analyse":
        return Response.json({ session: await analyseStep(body.inputs, { id: body.id, startedAt: body.startedAt, requester }) });
      case "generate":
        return Response.json({ session: await generateStep(body.session, body.inputs, { requester }) });
      case "review":
        return Response.json({ session: await reviewStep(body.session, body.inputs, { requester }) });
      case "follow-up":
        return Response.json(await decideFollowUp(body.session, body.questionId, { requester }));
      case "evaluate":
        return Response.json(await evaluateAnswer(body.session, body.questionId, { requester }));
      case "report":
        return Response.json(await writeReport(body.session, { requester }));
    }
  } catch (error) {
    // Log the kind of failure only: never the CV, the job description or an answer.
    const reason = error instanceof AskModelError ? error.reason : undefined;
    console.error(`interview lab: ${body.step} failed (${error instanceof Error ? error.name : "unknown"}${reason ? `, ${reason}` : ""})`);
    const known =
      error instanceof AskModelError ||
      error instanceof MockFixtureMissingError ||
      error instanceof InterviewStageError ||
      error instanceof InterviewRuleError;
    return Response.json(
      { error: known ? (error as Error).message : `The ${body.step} step failed. Try again.` },
      { status: known ? 422 : 500 },
    );
  }
}
