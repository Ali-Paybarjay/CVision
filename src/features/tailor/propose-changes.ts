import { randomUUID } from "node:crypto";
import type { Gap, Job, MatchResult, Profile } from "@/shared/contracts";
import { askModel, loadPrompt, type Requester } from "@/shared/ai";
import { enforceNothingInvented } from "./nothing-invented";
import { sectionLines } from "./tailored-cv";
import { ProposalSchema, type GapAnswer, type Proposal, type TailoringProposal } from "./types";

export type ProposeInput = {
  profile: Profile;
  job: Job;
  match: MatchResult;
  answers: GapAnswer[];
  /** Returned in mock mode. */
  sample: Proposal;
  /** Whose daily limit the request counts against: { userId } for a signed-in user. */
  requester?: Requester;
  /**
   * Other gaps and the user's answers to them. Not sent to the model, but the Nothing invented check uses them,
   * so a "no" to one gap still blocks that skill in a change for another gap.
   */
  context?: { gaps: Gap[]; answers: GapAnswer[] };
};

const sections = ["summary", "skills", "experience", "education", "certifications"] as const;

/** The model's raw proposal, before the Nothing invented check. The live evals test this directly. */
export async function askForProposal({ profile, job, match, answers, sample, requester }: ProposeInput): Promise<Proposal> {
  const prompt = await loadPrompt("tailor-propose", {
    job: JSON.stringify({ title: job.title, company: job.company, requirements: job.requirements }, null, 2),
    cv: JSON.stringify(
      {
        summary: profile.summary,
        skills: profile.skills,
        experience: profile.experience,
        education: profile.education,
        certifications: profile.certifications,
        followUpAnswers: profile.followUpAnswers.map(({ question, answer }) => ({ question, answer })),
      },
      null,
      2,
    ),
    lines: JSON.stringify(
      Object.fromEntries(sections.map((section) => [section, sectionLines(profile, section)])),
      null,
      2,
    ),
    gaps: JSON.stringify(match.gaps, null, 2),
    answers: JSON.stringify(answers, null, 2),
  });

  return askModel({ feature: "tailor-propose", prompt, schema: ProposalSchema, sample, requester });
}

/**
 * Suggested CV changes for one job, built from the user's answers.
 * Every change without traceable evidence is removed, and every change starts as "proposed":
 * nothing reaches the CV until the user approves it.
 */
export async function proposeChanges(input: ProposeInput): Promise<TailoringProposal> {
  const proposal = await askForProposal(input);
  const { kept, removed } = enforceNothingInvented(proposal.changes, {
    profile: input.profile,
    gaps: [...input.match.gaps, ...(input.context?.gaps ?? [])],
    answers: [...input.answers, ...(input.context?.answers ?? [])],
  });

  return {
    changes: kept.map((change) => ({
      ...change,
      id: randomUUID(),
      jobId: input.job.id,
      status: "proposed",
    })),
    nextSteps: proposal.nextSteps,
    removed,
  };
}
