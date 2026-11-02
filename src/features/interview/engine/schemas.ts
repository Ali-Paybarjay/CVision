// What each stage asks the model for. Each builder returns a zod schema with the stage's hard checks attached as
// refinements, so askModel's single retry covers them in live mode and mock samples pass the same checks.
// Length rules are left out here: stages.ts checks them after the reply and records any it breaks.
import { z } from "zod";
import {
  CandidateProfileSchema,
  GapTypeSchema,
  LookForSchema,
  PlannedFollowUpSchema,
  QuestionFocusSchema,
  ReviewChangeSchema,
  RoleProfileSchema,
  TechnicalQuestionTypeSchema,
  TechnicalScoresSchema,
} from "../contracts";
import {
  analysisProblems,
  evaluationProblems,
  isSoftProblem,
  questionSetProblems,
  reportProblems,
  suggestionProblems,
  type DraftQuestion,
  type EvaluationContext,
  type Problem,
  type QuestionSetContext,
  type ReportContext,
  type SuggestionContext,
} from "./checks";
import { IdSchema } from "@/shared/contracts";
import { limits } from "../config";

/** What the engine needs to start a session: the job ad and the CV as text. */
export const InterviewInputsSchema = z.object({
  jobId: IdSchema,
  jobDescription: z.string().min(1).max(limits.jobDescriptionMaxChars),
  cv: z.string().min(1).max(limits.cvMaxChars),
  /** Essential and desirable lists already parsed from a Job, or null for a pasted ad. */
  parsedRequirements: z.string().nullable(),
});
export type InterviewInputs = z.infer<typeof InterviewInputsSchema>;

/** `onRejected` hears the problems of each answer the checks send back, so a caller can record their rules. */
function withProblems<S extends z.ZodType>(schema: S, find: (value: z.output<S>) => Problem[], onRejected?: (problems: Problem[]) => void): S {
  return schema.superRefine((value, ctx) => {
    const hard = find(value).filter((p) => !isSoftProblem(p));
    if (hard.length) onRejected?.(hard);
    for (const problem of hard) {
      ctx.addIssue({ code: "custom", path: problem.path, message: problem.message });
    }
  }) as unknown as S;
}

export const AnalyseOutputSchema = z.object({
  roleProfile: RoleProfileSchema,
  candidateProfile: CandidateProfileSchema,
});
export type AnalyseOutput = z.infer<typeof AnalyseOutputSchema>;

export function analyseOutputSchema(jobDescription: string, cv: string) {
  return withProblems(AnalyseOutputSchema, (value) => analysisProblems(value, jobDescription, cv));
}

export const DraftQuestionSchema = z.object({
  id: IdSchema,
  type: TechnicalQuestionTypeSchema,
  competencyId: IdSchema,
  focus: QuestionFocusSchema,
  stretch: z.boolean(),
  text: z.string().min(1),
  rationale: z.object({ jdQuote: z.string().min(1), cvQuote: z.string().min(1).nullable(), why: z.string().min(1) }),
  lookFors: z.array(LookForSchema),
  anchors: z.object({ score1: z.string().min(1), score3: z.string().min(1), score5: z.string().min(1) }),
  redFlags: z.array(z.string().min(1)),
  followUps: z.array(PlannedFollowUpSchema),
});

export const DraftBlueprintSchema = z.object({
  mixNote: z.string().nullable(),
  slots: z.array(
    z.object({
      questionId: IdSchema,
      type: TechnicalQuestionTypeSchema,
      competencyId: IdSchema,
      focus: QuestionFocusSchema,
      reason: z.string().min(1),
    }),
  ),
});

export const GenerateOutputSchema = z.object({
  blueprint: DraftBlueprintSchema,
  questions: z.array(DraftQuestionSchema),
});
export type GenerateOutput = z.infer<typeof GenerateOutputSchema>;

export function generateOutputSchema(context: QuestionSetContext) {
  return withProblems(GenerateOutputSchema, (value) => questionSetProblems(value, context, "generate"));
}

/** The whole reviewed set: what the review stage produces once its reply is merged, and what the fixtures hold. */
export const ReviewOutputSchema = GenerateOutputSchema.extend({
  changelog: z.array(ReviewChangeSchema),
});
export type ReviewOutput = z.infer<typeof ReviewOutputSchema>;

export function reviewOutputSchema(context: QuestionSetContext, onRejected?: (problems: Problem[]) => void) {
  return withProblems(
    ReviewOutputSchema,
    (value) => {
      const problems = questionSetProblems(value, context, "review");
      const ids = new Set(value.questions.map((q) => q.id));
      value.changelog.forEach((change, i) => {
        if (!ids.has(change.questionId)) problems.push({ path: ["changelog", i, "questionId"], message: "Must be a question id in the set." });
      });
      return problems;
    },
    onRejected,
  );
}

/**
 * What the review model sends back (interview-review 2.0.0, #100): the blueprint, only the questions it rewrote, and
 * the changelog. Copying out the questions it kept, every rubric and follow-up included, was about a third of the wait
 * before question 1. The code puts the rewrites in place (mergeReviewReply) and checks the whole set as before.
 */
export const ReviewReplySchema = z.object({
  blueprint: DraftBlueprintSchema,
  rewritten: z.array(DraftQuestionSchema),
  changelog: z.array(ReviewChangeSchema),
});
export type ReviewReply = z.infer<typeof ReviewReplySchema>;

/** The draft set with each rewritten question in place of the one with the same id, in the draft's order. */
export function mergeReviewReply(reply: ReviewReply, draft: { questions: DraftQuestion[] }): ReviewOutput {
  const rewritten = new Map(reply.rewritten.map((q) => [q.id, q]));
  return { blueprint: reply.blueprint, questions: draft.questions.map((q) => rewritten.get(q.id) ?? q), changelog: reply.changelog };
}

/** The reply that turns `draft` into `reviewed`, for mock mode: the fixtures hold whole reviewed sets. */
export function reviewReplyFromSet(reviewed: ReviewOutput, draft: { questions: DraftQuestion[] }): ReviewReply {
  const before = new Map(draft.questions.map((q) => [q.id, JSON.stringify(q)]));
  return {
    blueprint: reviewed.blueprint,
    rewritten: reviewed.questions.filter((q) => before.get(q.id) !== JSON.stringify(q)),
    changelog: reviewed.changelog,
  };
}

/**
 * The review reply, checked as the whole set it makes with `draft`. A problem in a rewritten question points at it in
 * `rewritten`; one in a question the review left out says which question to rewrite, so askModel's retry can fix it.
 */
export function reviewReplySchema(context: QuestionSetContext, draft: { questions: DraftQuestion[] }, onRejected?: (problems: Problem[]) => void) {
  return withProblems(ReviewReplySchema, (reply) => reviewReplyProblems(reply, draft, context), onRejected);
}

function reviewReplyProblems(reply: ReviewReply, draft: { questions: DraftQuestion[] }, context: QuestionSetContext): Problem[] {
  const problems: Problem[] = [];
  const draftIds = new Set(draft.questions.map((q) => q.id));
  const position = new Map<string, number>();
  reply.rewritten.forEach((question, j) => {
    if (!draftIds.has(question.id)) problems.push({ path: ["rewritten", j, "id"], message: "Must be the id of a question in the set." });
    else if (position.has(question.id)) problems.push({ path: ["rewritten", j, "id"], message: "Give each rewritten question once." });
    else position.set(question.id, j);
  });
  reply.changelog.forEach((change, i) => {
    if (!position.has(change.questionId)) {
      problems.push({ path: ["changelog", i, "questionId"], message: "Must be the id of a question in rewritten: add the rewritten question." });
    }
  });
  if (problems.length > 0) return problems;

  const merged = mergeReviewReply(reply, draft);
  return questionSetProblems(merged, context, "review").map((problem) => {
    const [field, i, ...rest] = problem.path;
    if (field !== "questions" || typeof i !== "number") return problem;
    const id = merged.questions[i].id;
    const j = position.get(id);
    if (j !== undefined) return { ...problem, path: ["rewritten", j, ...rest] };
    const where = rest.length > 0 ? ` (${rest.join(".")})` : "";
    return { ...problem, path: ["rewritten"], message: `Question ${id}${where} is not in rewritten but breaks a rule: ${problem.message} Rewrite it in full and add it to rewritten.` };
  });
}

/** Deliberately loose: the code checks the follow-up text itself and falls back to the planned text. */
export const FollowUpOutputSchema = z.object({
  askFollowUp: z.boolean(),
  gapType: z.enum([...GapTypeSchema.options, "none"]),
  plannedFollowUpId: z.string().nullable(),
  followUpText: z.string().nullable(),
  reason: z.string(),
});
export type FollowUpOutput = z.infer<typeof FollowUpOutputSchema>;

export const EvaluateOutputSchema = z.object({
  lookForEvidence: z.array(
    z.object({
      lookForId: IdSchema,
      status: z.enum(["covered", "partial", "missing"]),
      quote: z.string().min(1).nullable(),
    }),
  ),
  errors: z.array(z.object({ claim: z.string().min(1), correction: z.string().min(1) })),
  accuracyConfidence: z.enum(["high", "medium", "low"]),
  scores: TechnicalScoresSchema,
  justifications: z.object({
    technicalAccuracy: z.string().min(1),
    depthOfReasoning: z.string().min(1),
    appliedEvidence: z.string().min(1),
    clarity: z.string().min(1),
  }),
  strengths: z.array(z.string().min(1)),
  weaknesses: z.array(z.string().min(1)),
  improvement: z.string().min(1),
  strongerAnswerOutline: z.array(z.string().min(1)),
  followUpClosedGap: z.boolean().nullable(),
});
export type EvaluateOutput = z.infer<typeof EvaluateOutputSchema>;

export function evaluateOutputSchema(context: EvaluationContext) {
  return withProblems(EvaluateOutputSchema, (value) => evaluationProblems(value, context));
}

export const ReportOutputSchema = z.object({
  verdict: z.string().min(1),
  priorities: z.array(z.object({ title: z.string().min(1), detail: z.string().min(1) })),
  levelGapNote: z.string().min(1).nullable(),
  uncertaintyNotes: z.array(z.object({ questionId: IdSchema, note: z.string().min(1) })),
});
export type ReportOutput = z.infer<typeof ReportOutputSchema>;

export function reportOutputSchema(context: ReportContext) {
  return withProblems(ReportOutputSchema, (value) => reportProblems(value, context));
}

/** One suggested answer (#205). Evidence is by CV line id only: the code copies the lines. */
export const SuggestOutputSchema = z.object({
  kind: z.enum(["evidence", "gap"]),
  points: z.array(z.object({ lookForId: IdSchema, text: z.string().min(1), evidenceLineIds: z.array(z.string()) })),
  sampleAnswer: z.string().min(1),
  honestLine: z.string().min(1).nullable(),
  followUpTips: z.array(z.object({ followUpId: IdSchema, tip: z.string().min(1) })),
  uncertainty: z.string().min(1).nullable(),
});
export type SuggestOutput = z.infer<typeof SuggestOutputSchema>;

export function suggestOutputSchema(context: SuggestionContext) {
  return withProblems(SuggestOutputSchema, (value) => suggestionProblems(value, context));
}
