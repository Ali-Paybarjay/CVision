import { z } from "zod";
import { ContractTypeSchema, HoursSchema, JobSchema, WorkModeSchema, type Job, type Salary } from "@/shared/contracts";
import { uniqueLines } from "./cv-extraction";

// A pasted job ad becomes a Job in two parts: the model reads the facts (title, pay, requirements…),
// and the code adds what the model must not touch: the id, the ad text as pasted, the link and the source.

/** Shorter than this is a title or a link, not a whole ad. */
export const MIN_AD_CHARACTERS = 200;
/** Longer than any real job ad: a bigger paste is usually a whole web page. */
export const MAX_AD_CHARACTERS = 20_000;
const MAX_URL_CHARACTERS = 2_000;

/** Caps that keep the gap questions on the tailor page to a sensible number. The prompt asks for fewer. */
const MAX_ESSENTIAL = 12;
const MAX_DESIRABLE = 8;

/** Pay as the model reads it. Only pounds are kept, so the currency is added in code. */
const ExtractedSalarySchema = z.object({
  min: z.number().nonnegative().optional(),
  max: z.number().nonnegative().optional(),
  period: z.enum(["year", "day", "hour"]),
});

/** What the model reads from a job ad (see prompts/profile-job.md). */
export const JobExtractionSchema = z.object({
  title: z.string(),
  /** Empty when an agency ad hides the employer. */
  company: z.string(),
  location: z.string(),
  salary: ExtractedSalarySchema.nullable(),
  contractType: ContractTypeSchema.nullable(),
  hours: HoursSchema.nullable(),
  workMode: WorkModeSchema.nullable(),
  requirements: z.object({
    essential: z.array(z.string()),
    desirable: z.array(z.string()),
  }),
});
export type JobExtraction = z.infer<typeof JobExtractionSchema>;

/** Turns what the model read into a Job, with the ad text exactly as the user pasted it. */
export function jobFromExtraction(
  extraction: JobExtraction,
  details: { id: string; adText: string; url: string | null },
): Job {
  const essential = uniqueLines(extraction.requirements.essential).slice(0, MAX_ESSENTIAL);
  const listed = new Set(essential.map((line) => line.toLowerCase()));
  const desirable = uniqueLines(extraction.requirements.desirable)
    .filter((line) => !listed.has(line.toLowerCase()))
    .slice(0, MAX_DESIRABLE);

  return JobSchema.parse({
    id: details.id,
    title: extraction.title.trim() || "Untitled role",
    company: extraction.company.trim() || "Company not named",
    location: extraction.location.trim(),
    salary: salaryFrom(extraction.salary),
    contractType: extraction.contractType,
    hours: extraction.hours,
    workMode: extraction.workMode,
    description: details.adText,
    requirements: { essential, desirable },
    url: details.url,
    source: "pasted",
  });
}

/** The facts of a Job in the model's format: the mock answer for a sample ad. */
export function extractionFromJob(job: Job): JobExtraction {
  return {
    title: job.title,
    company: job.company,
    location: job.location,
    salary: job.salary && { min: job.salary.min, max: job.salary.max, period: job.salary.period },
    contractType: job.contractType,
    hours: job.hours,
    workMode: job.workMode,
    requirements: job.requirements,
  };
}

function salaryFrom(salary: JobExtraction["salary"]): Salary | null {
  if (!salary || (salary.min === undefined && salary.max === undefined)) return null;
  const [min, max] =
    salary.min !== undefined && salary.max !== undefined && salary.min > salary.max
      ? [salary.max, salary.min]
      : [salary.min, salary.max];
  return { min, max, currency: "GBP", period: salary.period, isEstimate: false };
}

export type AdTextCheck = { ok: true; text: string } | { ok: false; message: string };

/** Tidies a pasted ad (line endings and outer spaces only) and checks its length. */
export function checkAdText(raw: unknown): AdTextCheck {
  const text = typeof raw === "string" ? raw.replace(/\r\n?/g, "\n").trim() : "";
  if (text === "") {
    return { ok: false, message: "Paste the job ad first." };
  }
  if (text.length < MIN_AD_CHARACTERS) {
    return {
      ok: false,
      message: "This looks too short to be a whole job ad. Paste all of it, including what the employer asks for.",
    };
  }
  if (text.length > MAX_AD_CHARACTERS) {
    return {
      ok: false,
      message: "This is longer than a job ad usually is. Paste only the ad itself, not the whole web page.",
    };
  }
  return { ok: true, text };
}

export type AdUrlCheck = { ok: true; url: string | null } | { ok: false; message: string };

/** The link to the ad is optional. "www.example.com/job" is accepted and gets https:// added. */
export function parseAdUrl(raw: unknown): AdUrlCheck {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (text === "") return { ok: true, url: null };

  const invalid = { ok: false, message: "Enter the full link to the ad, starting with https://" } as const;
  if (text.length > MAX_URL_CHARACTERS || /\s/.test(text)) return invalid;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || !url.hostname.includes(".")) return invalid;
    return { ok: true, url: url.href };
  } catch {
    return invalid;
  }
}
