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
  isLengthProblem,
  questionSetProblems,
  reportProblems,
  suggestionProblems,
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

function withProblems<S extends z.ZodType>(schema: S, find: (value: z.output<S>) => Problem[]): S {
  return schema.superRefine((value, ctx) => {
    for (const problem of find(value).filter((p) => !isLengthProblem(p))) {
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

export const ReviewOutputSchema = GenerateOutputSchema.extend({
  changelog: z.array(ReviewChangeSchema),
});
export type ReviewOutput = z.infer<typeof ReviewOutputSchema>;

export function reviewOutputSchema(context: QuestionSetContext) {
  return withProblems(ReviewOutputSchema, (value) => {
    const problems = questionSetProblems(value, context, "review");
    const ids = new Set(value.questions.map((q) => q.id));
    value.changelog.forEach((change, i) => {
      if (!ids.has(change.questionId)) problems.push({ path: ["changelog", i, "questionId"], message: "Must be a question id in the set." });
    });
    return problems;
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
