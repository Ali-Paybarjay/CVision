import { randomUUID } from "node:crypto";
import type { Gap, Job, MatchResult, Profile } from "@/shared/contracts";
import { askModel, loadPrompt, type Requester } from "@/shared/ai";
import { actionVerbs, bigSixSkills, bigSixTarget, isBigSix } from "./big-six";
import { conditionsNotShown, withoutConditionsAdded } from "./conditions";
import { jobForPrompt } from "./job-for-prompt";
import { cvLines, enforceNothingInvented } from "./nothing-invented";
import { fitsCv, sectionLines, listedSkillsTheAdAsksFor } from "./tailored-cv";
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
    job: jobForPrompt(job, { withAd: false }),
    cv: JSON.stringify(
      {
        summary: profile.summary,
        skills: profile.skills,
        experience: profile.experience,
        education: profile.education,
        certifications: profile.certifications,
        languages: profile.languages,
        projects: profile.projects,
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

/** Every line the user gave about themselves: their CV and their follow-up answers. */
const ownLines = (profile: Profile) => [...cvLines(profile), ...profile.followUpAnswers.map((item) => item.answer)];

/**
 * Suggested changes made from the CV alone, before the user answers anything: lines of their CV rewritten for the
 * job, and the main skills (such as Communication, never a tool) its lines show, up to six in all. Every change quotes a CV line
 * as evidence, rewrites a line that is on the CV, and passes the Nothing invented check with every gap counted as not confirmed. That check removes a change that adds a missing gap's requirement, or the ad's registration or Band (#422). The job's conditions the CV does not show are listed with the missing gaps, and a change that adds a licence, check or right to work among them is removed (#526); the rest of the ad is kept out by the prompt and the evals.
 */
export async function suggestFromCv({ profile, job, match, sample, requester }: SuggestInput): Promise<TailoringProposal> {
  // Main skills the CV lists and this ad asks for count towards the six. Its tools, and listed skills this ad does not need, do not.
  const room = Math.max(0, bigSixTarget - listedSkillsTheAdAsksFor(profile, job).length);
  const missing = match.gaps.filter((gap) => gap.kind === "missing");
  const conditions = conditionsNotShown(job, [...match.gaps, ...match.strengths].map((item) => item.requirement), ownLines(profile));
  const prompt = await loadPrompt("tailor-suggest", {
    // The whole ad, once per job, so a rewrite knows the setting and the ad's words for the same work (#403).
    job: jobForPrompt(job, { withAd: true }),
    strengths: JSON.stringify(match.strengths, null, 2),
    missing: JSON.stringify([...missing, ...conditions].map((item) => item.requirement), null, 2),
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
  const checked = enforceNothingInvented(fromCv, {
    profile,
    gaps: missing,
    answers: missing.map((gap) => ({ gapId: gap.id, question: "", answer: "Not confirmed yet.", hasExperience: false })),
    role: job.role,
  });
  const { kept, removed } = withoutConditionsAdded(checked.kept, conditions);

  // The cap comes after the check, so a skill the check refuses never takes the place of one it keeps.
  const allowed = [...kept.filter((change) => change.before !== null), ...kept.filter((change) => change.before === null).slice(0, room)];

  return {
    changes: allowed.map((change) => ({ ...change, id: randomUUID(), jobId: job.id, status: "proposed" })),
    nextSteps: [],
    removed: [...checked.removed, ...removed],
  };
}

/**
 * Suggested CV changes for one job, built from the user's answers.
 * Every change without traceable evidence is removed, and so is one that adds a licence, check or right to work of the
 * job's conditions that neither the CV nor the user's own words in a yes answer show (#526). Every change starts as
 * "proposed": nothing reaches the CV until the user approves it.
 */
export async function proposeChanges(input: ProposeInput): Promise<TailoringProposal> {
  const proposal = await askForProposal(input);
  const gaps = [...input.match.gaps, ...(input.context?.gaps ?? [])];
  const answers = [...input.answers, ...(input.context?.answers ?? [])];
  const checked = enforceNothingInvented(proposal.changes, { profile: input.profile, gaps, answers, role: input.job.role });
  const judged = [...gaps, ...input.match.strengths].map((item) => item.requirement);
  const { kept, removed } = withoutConditionsAdded(checked.kept, conditionsNotShown(input.job, judged, ownLines(input.profile), answers));

  return {
    changes: kept.map((change) => ({
      ...change,
      id: randomUUID(),
      jobId: input.job.id,
      status: "proposed",
    })),
    nextSteps: proposal.nextSteps,
    removed: [...checked.removed, ...removed],
  };
}
