import "server-only";
import { randomUUID } from "node:crypto";
import { askModel, loadPrompt } from "@/shared/ai";
import type { Job, MatchResult, Profile } from "@/shared/contracts";
import { personas, type PersonaName } from "@/shared/sample-data";
import { extractionFromJob, JobExtractionSchema, jobFromExtraction } from "../job-extraction";
import {
  assessByRules,
  buildMatchResult,
  jobRequirements,
  MatchAssessmentSchema,
  profileEvidenceLines,
  type JudgedRequirement,
} from "../match";
import type { Requester } from "./extract-profile";

/**
 * Turns a pasted job ad into a Job with askModel and prompts/profile-job.md.
 * In mock mode no model is called: the answer is the sample job the ad names (see sampleJobFor).
 */
export async function parseJob(adText: string, options: { url: string | null; requester?: Requester }): Promise<Job> {
  const extraction = await askModel({
    feature: "profile-job",
    prompt: await jobPrompt(adText),
    schema: JobExtractionSchema,
    sample: extractionFromJob(sampleJobFor(adText).job),
    // Pure data extraction: the brand voice would only invite rewording.
    voice: false,
    requester: options.requester,
    effort: "low",
    maxTokens: 4000,
  });

  return jobFromExtraction(extraction, { id: randomUUID(), adText, url: options.url });
}

/**
 * Matches a profile to a job with askModel and prompts/profile-match.md.
 * In mock mode the answer comes from simple word matching (assessByRules).
 * `unsupported` lists any requirement the model called met without pointing at a real profile line.
 */
export async function matchJob(
  profile: Profile,
  job: Job,
  options: { requester?: Requester } = {},
): Promise<{ match: MatchResult; judged: JudgedRequirement[]; unsupported: string[] }> {
  const assessment = await askModel({
    feature: "profile-match",
    prompt: await matchPrompt(profile, job),
    schema: MatchAssessmentSchema,
    sample: assessByRules(profile, job),
    requester: options.requester,
    // A dozen short verdicts and a few sentences. Haiku thinks first and that counts too.
    maxTokens: 6000,
  });

  return buildMatchResult(job, profile, assessment);
}

/** The sample job whose company the ad names, so each sample ad gets its own mock answer. Sara's first job if none. */
export function sampleJobFor(adText: string): { persona: PersonaName; job: Job } {
  const text = adText.toLowerCase();
  for (const persona of Object.keys(personas) as PersonaName[]) {
    const job = personas[persona].jobs.find((candidate) => text.includes(candidate.company.toLowerCase()));
    if (job) return { persona, job };
  }
  return { persona: "sara", job: personas.sara.jobs[0] };
}

/** The request text for reading an ad. */
export function jobPrompt(adText: string): Promise<string> {
  return loadPrompt("profile-job", { ad: withoutTags(adText, ["job_ad"]) });
}

/** The request text for a match: numbered requirements and numbered profile lines, without name or contact details. */
export function matchPrompt(profile: Profile, job: Job): Promise<string> {
  const tags = ["job", "requirements", "profile"];
  const requirements = jobRequirements(job)
    .map((requirement) => `${requirement.id} (${requirement.importance}): ${requirement.text}`)
    .join("\n");
  const lines = profileEvidenceLines(profile)
    .map((line) => `${line.id} [${line.context ? `${line.kind} · ${line.context}` : line.kind}] ${line.text}`)
    .join("\n");

  return loadPrompt("profile-match", {
    job: withoutTags(`${job.title} at ${job.company}`, tags),
    requirements: withoutTags(requirements || "(none)", tags),
    profile: withoutTags(lines || "(empty)", tags),
  });
}

/** Removes anything that looks like the prompt's own tags, so pasted text cannot close its section early. */
function withoutTags(text: string, tags: string[]): string {
  return tags.reduce((result, tag) => result.replace(new RegExp(`<\\s*/?\\s*${tag}\\b[^>]*>`, "gi"), ""), text);
}
