import type { Job, Profile } from "@/shared/contracts";
import type { AnalyseOutput, EvaluateOutput, FollowUpOutput, GenerateOutput, ReportOutput, ReviewOutput, SuggestOutput } from "../engine/schemas";

/** The kinds of sample answer the fixtures cover between them. */
export type SampleKind = "strong" | "adequate" | "shallow" | "technically-wrong" | "dont-know" | "injection";

/** A ready-made answer to one question, with the outputs the model would give for it. */
export type SampleAnswer = {
  kind: SampleKind;
  main: string;
  /** The answer to the follow-up, when the decision asks one. */
  followUp: string | null;
  decision: FollowUpOutput;
  evaluation: EvaluateOutput;
};

/**
 * One fictional candidate and job, with an output for every stage. In mock mode askModel returns these,
 * so a whole session runs without a model. Fictional people and companies only.
 */
export type InterviewFixture = {
  id: string;
  label: string;
  description: string;
  profile: Profile;
  job: Job;
  analyse: AnalyseOutput;
  generate: GenerateOutput;
  review: ReviewOutput;
  report: ReportOutput;
  /** By question id. */
  answers: Record<string, SampleAnswer>;
  /** Suggested answers after "End here" (#205), by question id. Questions without one get the code-built version. */
  suggestions?: Record<string, SuggestOutput>;
};
