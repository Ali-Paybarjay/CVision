// The interview practice API: one POST per engine step, plus "save". The browser sends only the job id; the job
// ad and CV are read on the server from the user's own data, so this API cannot be used to run other text.
import { after } from "next/server";
import { z } from "zod";
import { getAiMode, type Requester } from "@/shared/ai";
import { track } from "@/shared/analytics/track";
import { getCurrentUser } from "@/features/account/current-user";
import { applyReport } from "@/features/interview/engine/session";
import { analyseStep, decideFollowUp, evaluateAnswer, generateStep, reviewStep, writeReport } from "@/features/interview/engine/stages";
import { interviewInputsFor } from "@/features/interview/engine/text";
import { sessionCompletedEvent, sessionCompletedProperties } from "@/features/interview/server/completion-event";
import { getMyJob, getMyProfile } from "@/features/interview/server/my-data";
import { saveInterviewSession } from "@/features/interview/server/session-store";
import { badRequest, RequestSessionSchema as InterviewSessionSchema, stepFailed } from "@/features/interview/server/step-api";

const JobIdSchema = z.string().min(1).max(100);
const QuestionIdSchema = z.string().min(1);

const RequestSchema = z.discriminatedUnion("step", [
  z.object({ step: z.literal("analyse"), jobId: JobIdSchema, id: z.uuid(), startedAt: z.iso.datetime() }),
  z.object({ step: z.literal("generate"), jobId: JobIdSchema, session: InterviewSessionSchema }),
  z.object({ step: z.literal("review"), jobId: JobIdSchema, session: InterviewSessionSchema }),
  z.object({ step: z.literal("follow-up"), jobId: JobIdSchema, session: InterviewSessionSchema, questionId: QuestionIdSchema }),
  z.object({ step: z.literal("evaluate"), jobId: JobIdSchema, session: InterviewSessionSchema, questionId: QuestionIdSchema }),
  z.object({ step: z.literal("report"), jobId: JobIdSchema, session: InterviewSessionSchema }),
  z.object({ step: z.literal("save"), jobId: JobIdSchema, session: InterviewSessionSchema }),
]);

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  // Live requests spend the team's credit, so they need a signed-in user and count towards that user's daily limit.
  if (getAiMode() === "live" && !user) return Response.json({ error: "Sign in to practise for this interview." }, { status: 401 });
  const requester: Requester | undefined = getAiMode() === "live" && user ? { userId: user.id } : undefined;

  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues);
  const body = parsed.data;
  if ("session" in body && body.session.jobId !== body.jobId) {
    return Response.json({ error: "This practice session belongs to another job." }, { status: 400 });
  }

  // Only the user's own job and Profile: another user's job id finds nothing.
  const [job, profile] = await Promise.all([getMyJob(body.jobId), getMyProfile()]);
  if (!job || !profile) return Response.json({ error: "We could not find this job or your Profile." }, { status: 404 });
  const inputs = interviewInputsFor(job, profile);

  try {
    switch (body.step) {
      case "analyse":
        return Response.json({ session: await analyseStep(inputs, { id: body.id, startedAt: body.startedAt, requester }) });
      case "generate":
        return Response.json({ session: await generateStep(body.session, inputs, { requester }) });
      case "review":
        return Response.json({ session: await reviewStep(body.session, inputs, { requester }) });
      case "follow-up":
        return Response.json(await decideFollowUp(body.session, body.questionId, { requester }));
      case "evaluate":
        return Response.json(await evaluateAnswer(body.session, body.questionId, { requester }));
      case "report": {
        const result = await writeReport(body.session, { requester });
        const completed = applyReport(body.session, result.report);
        after(() => track(sessionCompletedEvent, sessionCompletedProperties(completed, result.report), user ? { userId: user.id } : undefined));
        return Response.json(result);
      }
      case "save":
        if (!user) return Response.json({ saved: false, reason: "signed-out" });
        return Response.json(await saveInterviewSession(body.session));
    }
  } catch (error) {
    return stepFailed("interview", body.step, error);
  }
}
