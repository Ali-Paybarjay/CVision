import "server-only";
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { askModel, loadPrompt } from "@/shared/ai";
import { track } from "@/shared/analytics/track";
import { cleanModelText } from "@/shared/clean-text";
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
  let counted = false;
  const extraction = await askModel({
    feature: "profile-job",
    prompt: await jobPrompt(adText),
    schema: JobExtractionSchema,
    sample: extractionFromJob(sampleJobFor(adText).job),
    // Pure data extraction: the brand voice would only invite rewording.
    voice: false,
    requester: options.requester,
    // Every criterion of a person specification is kept, so the reading matters more than its speed (#397).
    effort: "medium",
    maxTokens: 6000,
    // jobPrompt removes the ad's hidden characters, so askModel finds none to count. They are counted here instead,
    // when askModel would have: once, when the first request has its answer, in live mode only (#470).
    onUsage: () => {
      if (counted) return;
      counted = true;
      recordHiddenAdText(adText, options.requester);
    },
  });

  return jobFromExtraction(extraction, { id: randomUUID(), adText, url: options.url });
}

/** Records how many hidden characters of each kind the ad had, never the text: askModel's own event, under profile-job. */
function recordHiddenAdText(adText: string, requester: Requester): void {
  const { counts } = cleanModelText(adText);
  // Line separators became "\n" and stay, and every tamper sign is already counted under its own kind.
  const removed = Object.entries(counts)
    .filter(([kind]) => kind !== "lineSeparator" && kind !== "tamperSigns")
    .reduce((sum, [, count]) => sum + count, 0);
  if (removed === 0) return;

  const record = () => track("ai.hidden_text_removed", { feature: "profile-job", removed, ...counts }, requester);
  try {
    after(record);
  } catch {
    // Outside a request, as in a prompt eval, after() throws and there is no response to wait for.
    void record();
  }
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
  // Nothing to judge, as when every requirement is a condition of the job (#222): no request to the model.
  if (jobRequirements(job).length === 0) return buildMatchResult(job, profile, { requirements: [], reasoning: "" });

  const assessment = await askModel({
    feature: "profile-match",
    prompt: await matchPrompt(profile, job),
    schema: MatchAssessmentSchema,
    sample: assessByRules(profile, job),
    requester: options.requester,
    // Up to 36 short verdicts and a few sentences, and Haiku thinks first, which counts too: 23 criteria took 3,174
    // tokens on a real NHS ad (#410 review), so there is room for a whole person specification.
    maxTokens: 10000,
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

/**
 * The request text for reading an ad. Hidden characters go first, as in matchPrompt: askModel removes them only after
 * this, so "</job_" + U+200B + "ad>" would pass withoutTags and reach the model as a real "</job_ad>" (#470).
 */
export function jobPrompt(adText: string): Promise<string> {
  return loadPrompt("profile-job", { ad: withoutTags(cleanModelText(adText).text, ["job_ad"]) });
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
    // The whole ad as well, so a clinical line can be judged in the setting and words of the ad (#399). Hidden
    // characters go first: askModel removes them only after this, so "</j" + U+200B + "ob>" would pass withoutTags
    // and reach the model as a real "</job>", putting the rest of an outsider's ad among the user's lines (#421).
    job: withoutTags(cleanModelText(`${job.title} at ${job.company}\n\n${job.description}`).text, tags),
    requirements: withoutTags(requirements || "(none)", tags),
    profile: withoutTags(lines || "(empty)", tags),
  });
}

/**
 * Removes anything that looks like the prompt's own tags, so pasted text cannot close its section early. One pattern
 * for all of them, again until nothing changes: removing a tag can join the text either side into a new one, as
 * "</jo</job>b>" leaves "</job>" and "</jo<profile>b>" leaves "</job>" too (#470).
 */
function withoutTags(text: string, tags: string[]): string {
  const tag = new RegExp(`<\\s*/?\\s*(?:${tags.join("|")})\\b[^>]*>`, "gi");
  let result = text;
  for (let previous = ""; result !== previous; ) {
    previous = result;
    result = result.replace(tag, "");
  }
  return result;
}
