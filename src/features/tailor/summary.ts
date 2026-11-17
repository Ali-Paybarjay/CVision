import { randomUUID } from "node:crypto";
import type { Job, MatchResult, Profile, TailoringChange } from "@/shared/contracts";
import { askModel, loadPrompt, type Requester } from "@/shared/ai";
import { jobForPrompt } from "./job-for-prompt";
import { cvLines, enforceNothingInvented, normalise } from "./nothing-invented";
import type { DescribeAs } from "./summary-options";
import { ProposalSchema, type Proposal, type ProposedChange, type RejectedChange } from "./types";

export type SummaryInput = {
  profile: Profile;
  job: Job;
  match: MatchResult;
  /** How the user chose to be described, checked by the caller (`isAllowedDescription`). */
  describeAs: DescribeAs;
  /** Returned in mock mode. */
  sample: Proposal;
  requester?: Requester;
};

/** The new summary, waiting for the user's decision; null when the check removed it or it is the same as theirs. */
export type SummaryResult = { change: TailoringChange | null; removed: RejectedChange[] };

/** The description the prompt opens the summary with. The user's own words go in as data, in quotes. */
function describeAsForPrompt(describeAs: DescribeAs): string {
  if (describeAs.kind === "summary") return "the way their summary below describes them now: keep its opening description, such as its job title or field.";
  if (describeAs.kind === "title") return `${JSON.stringify(describeAs.title)}, a job title from their CV.`;
  return `${JSON.stringify(describeAs.words.trim())}, in their own words.`;
}

/**
 * The job ad's title, when the summary uses it but neither the CV nor the user's own words do (#16): a user who never
 * held that title must not be described by it. Null when the summary does not add it. Exported for its test.
 */
export function adTitleAdded(after: string, job: Job, profile: Profile, describeAs: DescribeAs): string | null {
  const title = normalise(job.title);
  if (!title || !normalise(after).includes(title)) return null;
  const said = [...cvLines(profile), describeAs.kind === "own" ? describeAs.words : ""].map(normalise);
  return said.some((line) => line.includes(title)) ? null : job.title;
}

/**
 * A professional summary for one job, written from the CV alone and opening with the description the user chose.
 * It always replaces the user's whole summary (or adds one when they have none), passes the Nothing invented check
 * with every missing gap counted as not confirmed, as the suggestions from the CV do, and never adds the ad's title.
 */
export async function writeSummary({ profile, job, match, describeAs, sample, requester }: SummaryInput): Promise<SummaryResult> {
  const missing = match.gaps.filter((gap) => gap.kind === "missing");
  const prompt = await loadPrompt("tailor-summary", {
    job: jobForPrompt(job, { withAd: true }),
    adTitle: JSON.stringify(job.title),
    describeAs: describeAsForPrompt(describeAs),
    strengths: JSON.stringify(match.strengths, null, 2),
    missing: JSON.stringify(missing.map((gap) => gap.requirement), null, 2),
    summary: JSON.stringify(profile.summary),
    cv: JSON.stringify(
      {
        skills: profile.skills,
        experience: profile.experience,
        education: profile.education,
        certifications: profile.certifications,
        languages: profile.languages,
        projects: profile.projects,
      },
      null,
      2,
    ),
  });
  const proposal = await askModel({ feature: "tailor-summary", prompt, schema: ProposalSchema, sample, requester });

  const hasSummary = profile.summary.trim() !== "";
  const written = proposal.changes.find((change) => change.section === "summary" && change.evidenceSource === "cv");
  if (!written || (hasSummary && normalise(written.after) === normalise(profile.summary))) return { change: null, removed: [] };

  // The whole summary is replaced, so `before` is always the user's own, whatever the model copied.
  const change: ProposedChange = { ...written, gapId: undefined, before: hasSummary ? profile.summary : null };
  const { kept, removed } = enforceNothingInvented([change], {
    profile,
    gaps: missing,
    answers: missing.map((gap) => ({ gapId: gap.id, question: "", answer: "Not confirmed yet.", hasExperience: false })),
    role: job.role,
  });
  const title = kept.length > 0 ? adTitleAdded(change.after, job, profile, describeAs) : null;
  if (title) removed.push({ change, reason: `It describes the user as "${title}", the job ad's title, which they did not choose.` });
  if (kept.length === 0 || title) return { change: null, removed };

  return { change: { ...change, id: randomUUID(), jobId: job.id, status: "proposed" }, removed };
}
