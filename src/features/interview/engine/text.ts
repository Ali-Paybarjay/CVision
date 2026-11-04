// Pure text helpers: CV and job text for the prompts, untrusted-input wrapping, word counts and quote checks.
import { cleanModelText } from "@/shared/clean-text";
import type { Job, Profile } from "@/shared/contracts";
import type { InterviewInputs } from "./schemas";

/** The tags that carry untrusted text in the interview prompts. */
export const untrustedTags = [
  "job_description",
  "parsed_requirements",
  "cv",
  "candidate_answer",
  "role_profile",
  "candidate_profile",
  "blueprint",
  "questions",
  "question",
  "look_fors",
  "planned_follow_ups",
  "transcript",
  "results",
  "level_plan",
  "level_gap",
  "rubric",
  "role",
] as const;

const tagPattern = new RegExp(`<\\s*(/?)\\s*(${untrustedTags.join("|")})\\b`, "gi");

/**
 * Makes untrusted text safe to place inside our XML tags: any tag of ours that appears in it
 * (for example a candidate typing "</candidate_answer>") loses its opening "<", so it cannot close the block early.
 */
export function neutraliseTags(text: string): string {
  return text.replace(tagPattern, (_, slash: string, name: string) => `&lt;${slash}${name}`);
}

/** Wraps untrusted text in one of our tags, e.g. <candidate_answer turn="main">…</candidate_answer>. */
export function wrapUntrusted(tag: (typeof untrustedTags)[number], text: string, attributes = ""): string {
  const open = attributes ? `<${tag} ${attributes}>` : `<${tag}>`;
  return `${open}\n${neutraliseTags(text)}\n</${tag}>`;
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

/** The first `max` words of a text, joined by single spaces. */
export function firstWords(text: string, max: number): string {
  return text.trim().split(/\s+/).slice(0, max).join(" ");
}

/** Sentences end at . ! or ? before a capital letter, so "e.g. vibration" or "etc. and" do not end one. */
export function splitSentences(text: string): string[] {
  return text
    .trim()
    .split(/(?<!\b(?:e\.g|i\.e|etc|vs|approx|incl|cf)\.)(?<=[.!?])\s+(?=["“(]?\p{Lu})/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

// cleanModelText first, so a quote from the model (which never saw the hidden characters) still matches the raw text (#68).
function normalise(text: string): string {
  return cleanModelText(text)
    .text.toLowerCase()
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .trim();
}

function stripQuoteEdges(quote: string): string {
  return quote.trim().replace(/^[\s"'.…‘’“”]+/, "").replace(/[\s"'.,;:!?…‘’“”]+$/, "");
}

/**
 * True when the quote appears word for word in the source. Hidden characters are removed; case, whitespace, curly
 * quotes and dashes are normalised; and quotation marks or ellipses at the edges of the quote are ignored. The words
 * must match.
 */
export function isVerbatim(quote: string, source: string): boolean {
  const needle = normalise(stripQuoteEdges(quote));
  return needle !== "" && normalise(source).includes(needle);
}

/** An answer that is not a genuine attempt: empty, or only "I don't know" and the like. */
export function isNonAnswer(text: string): boolean {
  const plain = text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (plain === "") return true;
  if (countWords(plain) > 8) return false;
  return /^(sorry )?(i (do not|don't|dont) know|no idea|not sure|i'm not sure|i am not sure|i have no idea|pass|skip|no comment|n a)( sorry)?$/.test(
    plain,
  );
}

/** The CV as plain text for the prompts. Name and contact details are left out: the interview does not need them. */
export function profileToCvText(profile: Profile): string {
  const lines: string[] = [];
  if (profile.summary) lines.push("Summary", profile.summary, "");
  if (profile.skills.length) lines.push("Skills", profile.skills.join(", "), "");
  if (profile.experience.length) {
    lines.push("Experience");
    for (const job of profile.experience) {
      const where = [job.company, job.location].filter(Boolean).join(", ");
      lines.push(`${job.title}, ${where} (${job.startDate} to ${job.endDate ?? "present"})`);
      for (const duty of job.duties) lines.push(`- ${duty}`);
      for (const achievement of job.achievements) lines.push(`- ${achievement}`);
    }
    lines.push("");
  }
  if (profile.education.length) {
    lines.push("Education");
    for (const course of profile.education) {
      const title = [course.qualification, course.subject].filter(Boolean).join(" ");
      const dates = course.startDate ? ` (${course.startDate} to ${course.endDate ?? "present"})` : course.endDate ? ` (${course.endDate})` : "";
      lines.push(`${title}, ${course.institution}${dates}${course.grade ? `, ${course.grade}` : ""}`);
    }
    lines.push("");
  }
  if (profile.certifications.length) {
    lines.push("Certifications");
    for (const cert of profile.certifications) {
      lines.push([cert.name, cert.issuer, cert.year].filter(Boolean).join(", "));
    }
    lines.push("");
  }
  if (profile.followUpAnswers.length) {
    lines.push("Additional information from the candidate");
    for (const item of profile.followUpAnswers) lines.push(`Question: ${item.question}`, `Answer: ${item.answer}`);
    lines.push("");
  }
  return lines.join("\n").trim();
}

/** One line of the CV that a suggested answer may cite, numbered L1, L2… for the model to point at. */
export type CvLine = { id: string; text: string };

/** The section headings profileToCvText writes, which are never evidence. */
const cvHeadings = new Set(["summary", "skills", "experience", "education", "certifications", "additional information from the candidate"]);

/**
 * The CV as numbered lines, one sentence each, for evidence by id: the model names a line and the code copies it, so a
 * quote can never be misremembered (the pattern of src/features/profile/match.ts). Built from the same CV text every
 * stage sees (profileToCvText, or the text pasted in the lab), so every line is word for word in the CV.
 */
export function cvEvidenceLines(cv: string): CvLine[] {
  const texts: string[] = [];
  for (const raw of cv.split(/\r?\n/)) {
    const line = raw.trim().replace(/^(?:[-•*]\s+|Answer:\s+)/, "");
    if (!line || cvHeadings.has(line.toLowerCase()) || line.startsWith("Question:")) continue;
    texts.push(...splitSentences(line));
  }
  return texts.map((text, i) => ({ id: `L${i + 1}`, text }));
}

/**
 * Stage 1 quotes 3 to 6 claims from the CV word for word (checks.ts). With fewer lines than this it almost always fails
 * after a paid request, and the questions would have little to work from.
 */
export const MIN_CV_LINES = 3;

/**
 * True when the CV has too few lines to start a practice, such as a profile typed in by hand with only a name (#179).
 * Checked before any request to the model, so it costs nothing.
 */
export function isCvTooThin(cv: string): boolean {
  return cvEvidenceLines(cv).length < MIN_CV_LINES;
}

/** The job ad as plain text for the prompts: title line, then the full ad as pasted. */
export function jobToText(job: Job): string {
  return `${job.title}, ${job.company}, ${job.location}\n\n${job.description}`;
}

/** The essential and desirable lists already parsed from the ad, as a hint for stage 1. */
export function jobRequirementsText(job: Job): string {
  return [`Essential: ${job.requirements.essential.join("; ")}`, `Desirable: ${job.requirements.desirable.join("; ")}`].join("\n");
}

/** What the engine reads for one job and one candidate. */
export function interviewInputsFor(job: Job, profile: Profile): InterviewInputs {
  return { jobId: job.id, jobDescription: jobToText(job), cv: profileToCvText(profile), parsedRequirements: jobRequirementsText(job) };
}
