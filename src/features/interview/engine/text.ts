// Pure text helpers: CV and job text for the prompts, untrusted-input wrapping, word counts and quote checks.
import type { Job, Profile } from "@/shared/contracts";

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

function normalise(text: string): string {
  return text
    .toLowerCase()
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
 * True when the quote appears word for word in the source. Case, whitespace, curly quotes and dashes are
 * normalised, and quotation marks or ellipses at the edges of the quote are ignored; the words must match.
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

/** The job ad as plain text for the prompts: title line, then the full ad as pasted. */
export function jobToText(job: Job): string {
  return `${job.title}, ${job.company}, ${job.location}\n\n${job.description}`;
}

/** The essential and desirable lists already parsed from the ad, as a hint for stage 1. */
export function jobRequirementsText(job: Job): string {
  return [`Essential: ${job.requirements.essential.join("; ")}`, `Desirable: ${job.requirements.desirable.join("; ")}`].join("\n");
}
