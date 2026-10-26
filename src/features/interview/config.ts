import type { LevelBand, TechnicalQuestionType } from "./contracts";

export type StageName = "analyse" | "generate" | "review" | "followUp" | "evaluate" | "report";

export type StageSettings = {
  /** prompts/<prompt>.md */
  prompt: string;
  model: string;
  effort: "low" | "medium" | "high";
  /** Thinking counts towards max_tokens, so leave room for it. */
  maxTokens: number;
};

/**
 * Model, effort and max_tokens for every stage, in one place.
 * Every stage runs on Haiku to keep a session to a few cents: the team has about $10 of credit.
 * These are starting points: tune them with the eval (`npm run eval`, src/features/interview/interview.eval.ts).
 * If the eval shows a stage needs a stronger model (generate is the most likely), move only that stage to Sonnet.
 */
export const stageConfig: Record<StageName, StageSettings> = {
  analyse: { prompt: "interview-analyse", model: "claude-haiku-5-5", effort: "medium", maxTokens: 8000 },
  // generate and review ran at high: about 13K output tokens each and most of a 138-second start. Medium is the
  // default now; move one back to high only if the eval shows its questions get worse.
  generate: { prompt: "interview-generate-technical", model: "claude-haiku-5-5", effort: "medium", maxTokens: 16000 },
  // A stronger model is worth trialling here, so that a different model checks the generator's work.
  // Compare with the eval: INTERVIEW_EVAL_REVIEW_MODEL=claude-sonnet-5-5 npm run eval
  review: { prompt: "interview-review", model: "claude-haiku-5-5", effort: "medium", maxTokens: 16000 },
  // At low effort Haiku can let reasoning leak into its reply; the code falls back to the planned text.
  // If tests show quality problems, raise effort to medium.
  followUp: { prompt: "interview-followup", model: "claude-haiku-5-5", effort: "low", maxTokens: 2000 },
  // The eval's target is a spread of 1 point or less per dimension; raise effort to high if medium misses it.
  evaluate: { prompt: "interview-evaluate-technical", model: "claude-haiku-5-5", effort: "medium", maxTokens: 8000 },
  report: { prompt: "interview-report", model: "claude-haiku-5-5", effort: "medium", maxTokens: 8000 },
};

/**
 * US dollars per million tokens, for prompts up to 100K tokens (October 2026).
 * Source: https://platform.claude.com/docs/en/about-claude/pricing
 * Used only for the mock-mode estimates; live requests take their cost from askModel. Never for billing.
 */
export const pricesPerMillion: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-opus-5-5": { input: 4, output: 20 },
};

/** This PR asks 6 technical questions; stage 2 changes this to { technical: 4, behavioural: 2 }. */
export const defaultComposition = { technical: 6, behavioural: 0 };

/** The default mix of the six questions for each level band. The blueprint may move one question, with a reason. */
export const levelMix: Record<LevelBand, Record<TechnicalQuestionType, number>> = {
  L1: { "cv-deep-dive": 1, "core-concept": 2, scenario: 1, "design-tradeoff": 1, "problem-solving": 1 },
  L2: { "cv-deep-dive": 1, "core-concept": 2, scenario: 1, "design-tradeoff": 1, "problem-solving": 1 },
  L3: { "cv-deep-dive": 2, "core-concept": 1, scenario: 1, "design-tradeoff": 1, "problem-solving": 1 },
  L4: { "cv-deep-dive": 2, "core-concept": 0, scenario: 1, "design-tradeoff": 2, "problem-solving": 1 },
  L5: { "cv-deep-dive": 2, "core-concept": 0, scenario: 1, "design-tradeoff": 2, "problem-solving": 1 },
};

/** What each band expects of a strong answer (adapted from SFIA's levels of responsibility). */
export const levelDescriptions: Record<LevelBand, string> = {
  L1: "Entry or graduate: correct fundamentals, structured reasoning, knows when to escalate.",
  L2: "Junior: applies standard methods and tools to realistic tasks; some hands-on examples.",
  L3: "Experienced: owns complex work end to end; diagnoses independently; justifies choices with trade-offs; concrete results.",
  L4: "Senior: system-level view; balances competing constraints; anticipates failure modes; advises and influences others.",
  L5: "Lead or principal: sets direction and standards; makes organisation-level trade-offs; develops others.",
};

/** Typed answers: the guide shown next to the word count, and stored on every question. */
export const answerGuide = { minWords: 150, maxWords: 300, suggestedMinutes: 4 };

export const limits = {
  /** Longest job ad, CV and single answer the lab API accepts, in characters, so one request cannot run up a large bill. */
  jobDescriptionMaxChars: 15_000,
  cvMaxChars: 20_000,
  answerMaxChars: 3_000,
  /**
   * Longest session the browser may send back, as JSON. A finished session with every answer at full length is
   * about 110K; the rest of it (role, blueprint, questions) has no length limits of its own, so this caps them.
   */
  sessionMaxChars: 150_000,
  questionMaxWords: 80,
  followUpMaxWords: 40,
  quoteMaxWords: 25,
  /** The one thing to do next time: a single specific action, not a list. */
  improvementMaxWords: 60,
};

/** Overall score thresholds for the readiness label. */
export const readinessThresholds = { ready: 4.0, nearlyReady: 3.0 };
