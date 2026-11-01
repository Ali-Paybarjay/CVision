// Shapes used only inside Tailor. The shared shapes (MatchResult, TailoringChange) live in src/shared/contracts.
import { z } from "zod";
import { IdSchema, TailoringChangeSchema, type TailoringChange } from "@/shared/contracts";

/** One plain question about the user's real experience, for one gap in the MatchResult. */
export const GapQuestionSchema = z.object({
  gapId: IdSchema,
  question: z.string().min(1),
  /** Up to three things the user may have done, in their voice, to tap as the answer. Without them the card asks yes or no. */
  options: z.array(z.string().min(1).max(200)).max(3).optional(),
});
export type GapQuestion = z.infer<typeof GapQuestionSchema>;

export const GapQuestionListSchema = z.object({
  questions: z.array(GapQuestionSchema),
});

/** The user's answer to a gap question, word for word. */
export type GapAnswer = {
  gapId: string;
  question: string;
  answer: string;
  /** False when the user says they have not done this. Nothing is then added for the gap (Nothing invented). */
  hasExperience: boolean;
};

/** An honest next step for a gap the user cannot cover yet: something to learn, or a related skill they do have. */
export const NextStepSchema = z.object({
  gapId: IdSchema,
  kind: z.enum(["learn", "related-skill"]),
  suggestion: z.string().min(1),
});
export type NextStep = z.infer<typeof NextStepSchema>;

/**
 * A change as the model writes it; Tailor adds the id, job and status.
 * The fields are listed one by one, so a field the contract gains later (such as `stretch`, which only code fills)
 * never reaches the model unless it is added here.
 */
export const ProposedChangeSchema = TailoringChangeSchema.pick({
  gapId: true,
  section: true,
  before: true,
  after: true,
  evidence: true,
  evidenceSource: true,
});
export type ProposedChange = z.infer<typeof ProposedChangeSchema>;

/** What the model answers to the tailor-propose prompt. */
export const ProposalSchema = z.object({
  changes: z.array(ProposedChangeSchema),
  nextSteps: z.array(NextStepSchema),
});
export type Proposal = z.infer<typeof ProposalSchema>;

/** A change the Nothing invented check removed, and why. */
export type RejectedChange = { change: ProposedChange; reason: string };

/** What the Tailor page shows: only changes with traceable evidence, all waiting for the user's approval. */
export type TailoringProposal = {
  changes: TailoringChange[];
  nextSteps: NextStep[];
  removed: RejectedChange[];
};
