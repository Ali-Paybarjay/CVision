import { z } from "zod";
import { DateTimeSchema, IdSchema } from "./common";

export const InterviewQuestionSchema = z.object({
  id: IdSchema,
  /** "behavioural" means competency-based, as UK employers usually ask. */
  kind: z.enum(["technical", "behavioural", "problem-solving", "common"]),
  text: z.string().min(1),
});
export type InterviewQuestion = z.infer<typeof InterviewQuestionSchema>;

const ScoreSchema = z.number().int().min(1).max(5);

/** Each answer is scored 1 to 5 on four criteria. */
export const AnswerScoresSchema = z.object({
  relevance: ScoreSchema,
  star: ScoreSchema,
  evidence: ScoreSchema,
  clarity: ScoreSchema,
});
export type AnswerScores = z.infer<typeof AnswerScoresSchema>;

export const AnswerFeedbackSchema = z.object({
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  /** One specific way to make this answer better. */
  suggestion: z.string().min(1),
});
export type AnswerFeedback = z.infer<typeof AnswerFeedbackSchema>;

export const InterviewAnswerSchema = z.object({
  questionId: IdSchema,
  /** Always stored as text. Phase 2 voice adds speech-to-text in front of this. */
  text: z.string(),
  inputMode: z.enum(["text", "voice"]).default("text"),
  /** Filled in once the answer has been scored. */
  scores: AnswerScoresSchema.nullable(),
  feedback: AnswerFeedbackSchema.nullable(),
});
export type InterviewAnswer = z.infer<typeof InterviewAnswerSchema>;

/** One practice interview for one job (person 4 builds it). */
export const InterviewSessionSchema = z.object({
  id: IdSchema,
  jobId: IdSchema,
  startedAt: DateTimeSchema,
  questions: z.array(InterviewQuestionSchema),
  answers: z.array(InterviewAnswerSchema),
  /** The overall report, once every answer is scored. */
  summary: z.string().nullable(),
});
export type InterviewSession = z.infer<typeof InterviewSessionSchema>;
