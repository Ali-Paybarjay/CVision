// The interview lab's API: one POST per engine step. A Route Handler rather than Server Actions, because the
// client dispatches Server Actions one at a time and answers are scored in the background while the interview goes on.
import { z } from "zod";
import { AskModelError } from "@/shared/ai";
import { InterviewSessionSchema } from "@/features/interview/contracts";
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

const RequestSchema = z.discriminatedUnion("step", [
  z.object({ step: z.literal("analyse"), inputs: InterviewInputsSchema, id: z.string().min(1), startedAt: z.iso.datetime() }),
  z.object({ step: z.literal("generate"), inputs: InterviewInputsSchema, session: InterviewSessionSchema }),
  z.object({ step: z.literal("review"), inputs: InterviewInputsSchema, session: InterviewSessionSchema }),
  z.object({ step: z.literal("follow-up"), session: InterviewSessionSchema, questionId: z.string().min(1) }),
  z.object({ step: z.literal("evaluate"), session: InterviewSessionSchema, questionId: z.string().min(1) }),
  z.object({ step: z.literal("report"), session: InterviewSessionSchema }),
]);

/** The lab is for development and previews only: it does not exist on the production deployment. */
function isProduction(): boolean {
  return process.env.VERCEL_ENV === "production";
}

export async function POST(request: Request): Promise<Response> {
  if (isProduction()) return new Response("Not found", { status: 404 });

  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "The request did not match any interview step." }, { status: 400 });
  const body = parsed.data;

  try {
    switch (body.step) {
      case "analyse":
        return Response.json({ session: await analyseStep(body.inputs, { id: body.id, startedAt: body.startedAt }) });
      case "generate":
        return Response.json({ session: await generateStep(body.session, body.inputs) });
      case "review":
        return Response.json({ session: await reviewStep(body.session, body.inputs) });
      case "follow-up":
        return Response.json(await decideFollowUp(body.session, body.questionId));
      case "evaluate":
        return Response.json(await evaluateAnswer(body.session, body.questionId));
      case "report":
        return Response.json(await writeReport(body.session));
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
