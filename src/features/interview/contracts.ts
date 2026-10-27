// The shape of a technical interview practice session.
// Additive extensions of the shared InterviewQuestion and InterviewSession contracts, proposed for
// src/shared/contracts/interview.ts. They live here until the team agrees the move (CLAUDE.md, rule 3);
// until then, import interview types from this file, not from @/shared/contracts.
import { z } from "zod";
import {
  DateTimeSchema,
  IdSchema,
  InterviewQuestionSchema as SharedInterviewQuestionSchema,
  InterviewSessionSchema as SharedInterviewSessionSchema,
} from "@/shared/contracts";

export { InterviewAnswerSchema, type InterviewAnswer } from "@/shared/contracts";

/** Levels of responsibility, adapted from SFIA: L1 entry to L5 lead. The role's band is the bar. */
export const LevelBandSchema = z.enum(["L1", "L2", "L3", "L4", "L5"]);
export type LevelBand = z.infer<typeof LevelBandSchema>;

/** "behavioural" is reserved for stage 2 (4 technical and 2 behavioural questions). */
export const QuestionCategorySchema = z.enum(["technical", "behavioural"]);
export type QuestionCategory = z.infer<typeof QuestionCategorySchema>;

export const TechnicalQuestionTypeSchema = z.enum([
  "cv-deep-dive",
  "core-concept",
  "scenario",
  "design-tradeoff",
  "problem-solving",
]);
export type TechnicalQuestionType = z.infer<typeof TechnicalQuestionTypeSchema>;

const gapTypes = ["missing-specifics", "missing-reasoning", "missing-key-point", "technical-error", "unverified-claim"] as const;

/** What a thin answer lacks. Each planned follow-up targets one gap type. */
export const GapTypeSchema = z.enum(gapTypes);
export type GapType = z.infer<typeof GapTypeSchema>;

/** How a turn was given. "voice" is reserved for phase 2, as in InterviewAnswer. */
export const InputModeSchema = z.enum(["text", "voice"]);
export type InputMode = z.infer<typeof InputModeSchema>;

export const QuestionFocusSchema = z.enum(["verify-claim", "probe-gap", "core-requirement"]);
export type QuestionFocus = z.infer<typeof QuestionFocusSchema>;

export const LookForSchema = z.object({
  id: IdSchema,
  /** A concept or criterion, never an exact figure. */
  text: z.string().min(1),
  confidence: z.enum(["high", "medium"]),
});
export type LookFor = z.infer<typeof LookForSchema>;

/** Written with the question, before any answer is seen. At most one is asked. */
export const PlannedFollowUpSchema = z.object({
  id: IdSchema,
  gapType: GapTypeSchema,
  /** One question of at most 40 words, with no hint of the answer. */
  text: z.string().min(1),
});
export type PlannedFollowUp = z.infer<typeof PlannedFollowUpSchema>;

export const InterviewQuestionSchema = SharedInterviewQuestionSchema.extend({
  // Optional, so existing questions stay valid. A technical interview question has all of them.
  category: QuestionCategorySchema.optional(),
  type: TechnicalQuestionTypeSchema.optional(),
  /** A competency id from the session's roleProfile. */
  competencyId: IdSchema.optional(),
  focus: QuestionFocusSchema.optional(),
  /** The role's level, which is the bar for every answer. */
  level: LevelBandSchema.optional(),
  /** The stretch question asked when the CV's level is below the role's. */
  stretch: z.boolean().optional(),
  rationale: z
    .object({
      /** Verbatim from the job description. */
      jdQuote: z.string().min(1),
      /** Verbatim from the CV. Every cv-deep-dive question has one. */
      cvQuote: z.string().min(1).optional(),
      why: z.string().min(1),
    })
    .optional(),
  /** 3 to 5. */
  lookFors: z.array(LookForSchema).optional(),
  /** What a 1, a 3 and a 5 look like for this question. */
  anchors: z.object({ score1: z.string().min(1), score3: z.string().min(1), score5: z.string().min(1) }).optional(),
  redFlags: z.array(z.string().min(1)).optional(),
  /** 2 or 3, each with a different gap type. */
  followUps: z.array(PlannedFollowUpSchema).optional(),
  answerGuide: z
    .object({
      minWords: z.number().int().positive(),
      maxWords: z.number().int().positive(),
      suggestedMinutes: z.number().positive(),
    })
    .optional(),
});
export type InterviewQuestion = z.infer<typeof InterviewQuestionSchema>;

/** A question as the technical interview engine needs it: every field above present. */
export const TechnicalInterviewQuestionSchema = InterviewQuestionSchema.required().extend({
  category: z.literal("technical"),
});
export type TechnicalInterviewQuestion = z.infer<typeof TechnicalInterviewQuestionSchema>;

const ScoreSchema = z.number().int().min(1).max(5);

/** One line of the interview, in order: question, answer, at most one follow-up and its answer. */
export const InterviewTurnSchema = z.object({
  id: IdSchema,
  questionId: IdSchema,
  speaker: z.enum(["interviewer", "candidate"]),
  kind: z.enum(["main", "follow-up"]),
  /** Typed text now; the transcript in phase 2. */
  text: z.string(),
  inputMode: InputModeSchema,
  /** null until phase 2 stores audio. */
  audioRef: z.string().nullable(),
  startedAt: DateTimeSchema.optional(),
  submittedAt: DateTimeSchema.optional(),
  durationMs: z.number().int().nonnegative().optional(),
});
export type InterviewTurn = z.infer<typeof InterviewTurnSchema>;

export const FollowUpDecisionSchema = z.object({
  questionId: IdSchema,
  askFollowUp: z.boolean(),
  gapType: z.enum([...gapTypes, "none"]),
  plannedFollowUpId: IdSchema.optional(),
  followUpText: z.string().min(1).optional(),
  /** True when the planned text was used because the model's output was invalid. */
  usedFallback: z.boolean(),
  reason: z.string(),
});
export type FollowUpDecision = z.infer<typeof FollowUpDecisionSchema>;

/** Chosen by question category from a registry. "behavioural-v1" is reserved for stage 2. */
export const RubricIdSchema = z.enum(["technical-v1", "behavioural-v1"]);
export type RubricId = z.infer<typeof RubricIdSchema>;

/** The technical-v1 dimensions, each scored 1 to 5. */
export const TechnicalScoresSchema = z.object({
  technicalAccuracy: ScoreSchema,
  depthOfReasoning: ScoreSchema,
  appliedEvidence: ScoreSchema,
  clarity: ScoreSchema,
});
export type TechnicalScores = z.infer<typeof TechnicalScoresSchema>;

/** One question scored on its own, against the rubric written before the answer was seen. */
export const AnswerEvaluationSchema = z.object({
  questionId: IdSchema,
  rubricId: z.literal("technical-v1"),
  scores: TechnicalScoresSchema,
  /** Mean of the four scores to one decimal, capped at 2.5 when technical accuracy is 2 or below. Computed in code. */
  overall: z.number().min(1).max(5),
  lookForEvidence: z.array(
    z.object({
      lookForId: IdSchema,
      status: z.enum(["covered", "partial", "missing"]),
      /** Verbatim from the answer, at most 25 words. Present when covered or partial. */
      quote: z.string().min(1).optional(),
    }),
  ),
  /** Each with a one-line correction. */
  errors: z.array(z.object({ claim: z.string().min(1), correction: z.string().min(1) })),
  accuracyConfidence: z.enum(["high", "medium", "low"]),
  justifications: z.object({
    technicalAccuracy: z.string().min(1),
    depthOfReasoning: z.string().min(1),
    appliedEvidence: z.string().min(1),
    clarity: z.string().min(1),
  }),
  /** 0 to 2: none when the answer gives nothing to credit. */
  strengths: z.array(z.string().min(1)),
  /** 1 or 2. */
  weaknesses: z.array(z.string().min(1)),
  /** Exactly one specific thing to do next time. */
  improvement: z.string().min(1),
  /** 3 to 5 points, with placeholders such as "[your actual figure]" instead of invented facts. */
  strongerAnswerOutline: z.array(z.string().min(1)),
  /** Set when a follow-up was asked. */
  followUpClosedGap: z.boolean().optional(),
});
export type AnswerEvaluation = z.infer<typeof AnswerEvaluationSchema>;

export const CompetencySchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  priority: z.enum(["must-have", "nice-to-have"]),
  weight: z.number().int().min(1).max(3),
  /** Verbatim from the job description. */
  jdQuote: z.string().min(1),
});
export type Competency = z.infer<typeof CompetencySchema>;

/** What the role asks for, read from the job description. */
export const RoleProfileSchema = z.object({
  title: z.string().min(1),
  discipline: z.string().min(1),
  sector: z.string().min(1),
  /** For example, a regulated environment. */
  ukContext: z.string(),
  roleLevel: LevelBandSchema,
  /** One line, quoting the job description. */
  roleLevelReason: z.object({ jdQuote: z.string().min(1), why: z.string().min(1) }),
  /** 4 to 8. */
  competencies: z.array(CompetencySchema),
  /** Tools, methods, standards and regulations the job description names, verbatim. */
  namedItems: z.array(z.object({ text: z.string().min(1), kind: z.enum(["tool", "method", "standard", "regulation"]) })),
});
export type RoleProfile = z.infer<typeof RoleProfileSchema>;

/** What the CV shows against the role. It never records protected characteristics. */
export const CandidateProfileSchema = z.object({
  /** The level the CV shows overall. Below roleLevel means a stretch question and a note in the report. */
  cvLevel: LevelBandSchema,
  cvLevelReason: z.string().min(1),
  evidence: z.array(
    z.object({
      competencyId: IdSchema,
      /** Verbatim from the CV; null when there is none. */
      cvQuote: z.string().min(1).nullable(),
      /** null when the CV shows no evidence. */
      estimatedLevel: LevelBandSchema.nullable(),
    }),
  ),
  /** 3 to 6 specific claims worth probing (results, scale, ownership, tools), verbatim. */
  claimsToProbe: z.array(
    z.object({ id: IdSchema, quote: z.string().min(1), kind: z.enum(["result", "scale", "ownership", "tool"]) }),
  ),
  /** Must-have competencies with weak or no evidence in the CV. */
  gaps: z.array(z.object({ competencyId: IdSchema, evidence: z.enum(["weak", "none"]), note: z.string().min(1) })),
});
export type CandidateProfile = z.infer<typeof CandidateProfileSchema>;

/** The plan behind the question set: which competency and type each question covers, and why. */
export const QuestionBlueprintSchema = z.object({
  /** Why the mix differs from the level table, if it does (by one question at most). */
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
export type QuestionBlueprint = z.infer<typeof QuestionBlueprintSchema>;

/** One rewrite made by the review stage. */
export const ReviewChangeSchema = z.object({
  questionId: IdSchema,
  /** The checklist item the question failed. */
  check: z.enum([
    "anchored",
    "level",
    "one-speakable-question",
    "not-cheap",
    "technically-sound",
    "fair-and-lawful",
    "distinct",
    "rubric-complete",
  ]),
  fix: z.string().min(1),
});
export type ReviewChange = z.infer<typeof ReviewChangeSchema>;

/** The end-of-session report. It aggregates the evaluations and never re-scores them. */
export const InterviewReportSchema = z.object({
  /** Mean of the question scores to one decimal. */
  overall: z.number().min(1).max(5),
  /** ready: 4.0 or above; nearly-ready: 3.0 to 3.9; not-yet-ready: below 3.0. */
  readiness: z.enum(["ready", "nearly-ready", "not-yet-ready"]),
  verdict: z.string().min(1),
  competencyMap: z.array(
    z.object({
      competencyId: IdSchema,
      status: z.enum(["strong", "adequate", "gap", "not-assessed"]),
      /** The questions that showed it. */
      questionIds: z.array(IdSchema),
    }),
  ),
  /** The top three things to prepare before the real interview. */
  priorities: z.array(z.object({ title: z.string().min(1), detail: z.string().min(1) })),
  /** Present whenever the CV's level is below the role's. */
  levelGapNote: z.string().nullable(),
  /** One per question whose accuracy confidence is low. */
  uncertaintyNotes: z.array(z.object({ questionId: IdSchema, note: z.string().min(1) })),
});
export type InterviewReport = z.infer<typeof InterviewReportSchema>;

/** Tokens and cost of one model request. */
export const StageUsageSchema = z.object({
  /** The engine stage, e.g. "analyse" or "evaluate". */
  stage: z.string().min(1),
  questionId: IdSchema.optional(),
  model: z.string().min(1),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
  /** True in mock mode, where the numbers are estimated from text length; false when askModel reported them. */
  estimated: z.boolean(),
});
export type StageUsage = z.infer<typeof StageUsageSchema>;

/** One practice interview for one job (Marzieh builds it). */
export const InterviewSessionSchema = SharedInterviewSessionSchema.extend({
  questions: z.array(InterviewQuestionSchema),
  // Optional, added for technical interview practice. `turns` is the full record;
  // `answers` and `summary` mirror it for code that reads the original fields.
  plan: z
    .object({
      /** { technical: 6, behavioural: 0 } now; stage 2 uses { technical: 4, behavioural: 2 }. */
      composition: z.object({ technical: z.number().int().nonnegative(), behavioural: z.number().int().nonnegative() }),
      roleLevel: LevelBandSchema,
    })
    .optional(),
  roleProfile: RoleProfileSchema.optional(),
  candidateProfile: CandidateProfileSchema.optional(),
  blueprint: QuestionBlueprintSchema.optional(),
  reviewChangelog: z.array(ReviewChangeSchema).optional(),
  turns: z.array(InterviewTurnSchema).optional(),
  followUpDecisions: z.array(FollowUpDecisionSchema).optional(),
  evaluations: z.array(AnswerEvaluationSchema).optional(),
  report: InterviewReportSchema.optional(),
  usage: z.array(StageUsageSchema).optional(),
  /** What produced this session, so phase 2 can replay or re-score it. */
  versions: z
    .object({
      mode: z.enum(["mock", "live"]),
      /** Prompt name to version, e.g. { "interview-analyse": "1.0.0" }. */
      prompts: z.record(z.string(), z.string()),
      /** Stage to model id. */
      models: z.record(z.string(), z.string()),
    })
    .optional(),
});
export type InterviewSession = z.infer<typeof InterviewSessionSchema>;
