import { randomUUID } from "node:crypto";
import type { Gap, Job, MatchResult, Profile } from "@/shared/contracts";
import { askModel, loadPrompt, type Requester } from "@/shared/ai";
import { actionVerbs, bigSixSkills, bigSixTarget, isBigSix } from "./big-six";
import { enforceNothingInvented } from "./nothing-invented";
import { fitsCv, sectionLines } from "./tailored-cv";
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
    actionVerbs: actionVerbs.join(", "),
  });

  return askModel({ feature: "tailor-propose", prompt, schema: ProposalSchema, sample, requester });
}

export type SuggestInput = {
  profile: Profile;
  job: Job;
  match: MatchResult;
  /** Returned in mock mode. */
  sample: Proposal;
  requester?: Requester;
};

/**
 * Suggested changes made from the CV alone, before the user answers anything: lines of their CV rewritten for the
 * job, and the main skills (such as Communication, never a tool) its lines show, up to six in all. Every change quotes a CV line
 * as evidence, rewrites a line that is on the CV, and passes the Nothing invented check with every gap counted as not confirmed, so nothing the job asks for can slip in before the user says yes.
 */
export async function suggestFromCv({ profile, job, match, sample, requester }: SuggestInput): Promise<TailoringProposal> {
  // Skills the CV lists itself that are already main skills count towards the six; its tools do not.
  const room = Math.max(0, bigSixTarget - profile.skills.filter(isBigSix).length);
  const prompt = await loadPrompt("tailor-suggest", {
    job: JSON.stringify({ title: job.title, company: job.company, requirements: job.requirements }, null, 2),
    strengths: JSON.stringify(match.strengths, null, 2),
    missing: JSON.stringify(match.gaps.filter((gap) => gap.kind === "missing").map((gap) => gap.requirement), null, 2),
    lines: JSON.stringify(Object.fromEntries(sections.map((section) => [section, sectionLines(profile, section)])), null, 2),
    skillsToAdd: String(room),
    mainSkills: bigSixSkills.join(", "),
    actionVerbs: actionVerbs.join(", "),
  });
  const proposal = await askModel({ feature: "tailor-suggest", prompt, schema: ProposalSchema, sample, requester });

  const cvChanges = proposal.changes
    .filter((change) => change.evidenceSource === "cv" && fitsCv(profile, change))
    .map((change) => ({ ...change, gapId: undefined }));
  // A new line is only ever a main skill the CV lacks in its skills list, and only up to six in all.
  const known = new Set(profile.skills.map((skill) => skill.trim().toLowerCase()));
  const newSkills = cvChanges
    .filter((change) => change.before === null && change.section === "skills" && isBigSix(change.after) && !known.has(change.after.trim().toLowerCase()))
    .filter((change, index, all) => all.findIndex((other) => other.after.trim().toLowerCase() === change.after.trim().toLowerCase()) === index);
  const fromCv = [...cvChanges.filter((change) => change.before !== null).slice(0, 5), ...newSkills];
  const { kept, removed } = enforceNothingInvented(fromCv, {
    profile,
    gaps: match.gaps.filter((gap) => gap.kind === "missing"),
    answers: match.gaps
      .filter((gap) => gap.kind === "missing")
      .map((gap) => ({ gapId: gap.id, question: "", answer: "Not confirmed yet.", hasExperience: false })),
  });

  // The cap comes after the check, so a skill the check refuses never takes the place of one it keeps.
  const allowed = [...kept.filter((change) => change.before !== null), ...kept.filter((change) => change.before === null).slice(0, room)];

  return {
    changes: allowed.map((change) => ({ ...change, id: randomUUID(), jobId: job.id, status: "proposed" })),
    nextSteps: [],
    removed,
  };
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
