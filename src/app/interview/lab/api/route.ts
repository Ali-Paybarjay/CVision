// The interview lab's API: one POST per engine step. A Route Handler rather than Server Actions, because the
// client dispatches Server Actions one at a time and answers are scored in the background while the interview goes on.
import { z } from "zod";
import { getAiMode, type Requester } from "@/shared/ai";
import { getCurrentUser } from "@/features/account/current-user";
import { InterviewInputsSchema } from "@/features/interview/engine/schemas";
import { analyseStep, decideFollowUp, evaluateAnswer, generateStep, reviewStep, suggestAnswer, writeReport } from "@/features/interview/engine/stages";
import { badRequest, RequestSessionSchema as InterviewSessionSchema, stepFailed } from "@/features/interview/server/step-api";
import { isLabEnabled } from "../lab-access";

/** As on the main interview API: the browser's own limit for a start-up stage (180 seconds) always comes first (#266). */
export const maxDuration = 300;

const RequestSchema = z.discriminatedUnion("step", [
  z.object({ step: z.literal("analyse"), inputs: InterviewInputsSchema, id: z.string().min(1), startedAt: z.iso.datetime() }),
  z.object({ step: z.literal("generate"), inputs: InterviewInputsSchema, session: InterviewSessionSchema }),
  z.object({ step: z.literal("review"), inputs: InterviewInputsSchema, session: InterviewSessionSchema }),
  z.object({ step: z.literal("follow-up"), session: InterviewSessionSchema, questionId: z.string().min(1) }),
  z.object({ step: z.literal("evaluate"), session: InterviewSessionSchema, questionId: z.string().min(1) }),
  z.object({ step: z.literal("report"), session: InterviewSessionSchema }),
  // The lab records no events, so "End here" has nothing to do on the server.
  z.object({ step: z.literal("end"), session: InterviewSessionSchema }),
  z.object({ step: z.literal("suggest"), inputs: InterviewInputsSchema, session: InterviewSessionSchema, questionId: z.string().min(1) }),
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
  if (!parsed.success) return badRequest(parsed.error.issues);
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
      case "end":
        return Response.json({ ended: true });
      case "suggest":
        return Response.json(await suggestAnswer(body.session, body.questionId, body.inputs, { requester }));
    }
  } catch (error) {
    return stepFailed("interview lab", body.step, error);
  }
}
