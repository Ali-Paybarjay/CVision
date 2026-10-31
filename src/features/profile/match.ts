import { z } from "zod";
import { MatchResultSchema, type Gap, type Job, type MatchResult, type Profile, type Strength } from "@/shared/contracts";
import { formatPeriod } from "./ui/format";

// A match is judged one requirement at a time. The model (or, in mock mode, simple rules) says whether the
// profile shows each requirement and points at the profile line that proves it, by the line's id. The code
// then copies that line word for word as the evidence, so a strength can only ever quote what the user wrote
// (Nothing invented). The score is worked out in code, so the same answers always give the same score.

export type EvidenceKind =
  | "summary"
  | "skill"
  | "role"
  | "duty"
  | "achievement"
  | "volunteering"
  | "education"
  | "project"
  | "certification"
  | "language"
  | "answer";

/** One line of the profile that can show a requirement is met, numbered L1, L2… for the model to point at. */
export type EvidenceLine = { id: string; kind: EvidenceKind; text: string; context?: string };

/** Every line of the profile that can be evidence, in profile order. Name and contact details are never included. */
export function profileEvidenceLines(profile: Profile): EvidenceLine[] {
  const lines: Omit<EvidenceLine, "id">[] = [];
  for (const sentence of splitSentences(profile.summary)) lines.push({ kind: "summary", text: sentence });
  for (const skill of profile.skills) lines.push({ kind: "skill", text: skill });
  for (const job of profile.experience) {
    const role = `${job.title} at ${job.company}`;
    lines.push({ kind: "role", text: role, context: formatPeriod(job.startDate, job.endDate) });
    for (const duty of job.duties) lines.push({ kind: "duty", text: duty, context: role });
    for (const achievement of job.achievements) lines.push({ kind: "achievement", text: achievement, context: role });
  }
  // Volunteering, projects and languages (#227): before them, a spoken language read from a CV was a skill.
  for (const unpaid of profile.volunteering ?? []) {
    const role = unpaid.organisation ? `${unpaid.role} at ${unpaid.organisation}` : unpaid.role;
    lines.push({ kind: "volunteering", text: role, context: formatPeriod(unpaid.startDate, unpaid.endDate) || undefined });
    for (const detail of unpaid.details) lines.push({ kind: "volunteering", text: detail, context: role });
  }
  for (const course of profile.education) {
    const award = course.subject ? `${course.qualification} in ${course.subject}` : course.qualification;
    lines.push({ kind: "education", text: [award, course.institution, course.grade].filter(Boolean).join(", ") });
  }
  for (const project of profile.projects ?? []) {
    const name = [project.name, project.organisation].filter(Boolean).join(", ");
    lines.push({ kind: "project", text: name, context: formatPeriod(project.startDate, project.endDate) || undefined });
    for (const detail of project.details) lines.push({ kind: "project", text: detail, context: name });
  }
  for (const certificate of profile.certifications) {
    lines.push({ kind: "certification", text: [certificate.name, certificate.issuer, certificate.year].filter(Boolean).join(", ") });
  }
  for (const language of profile.languages ?? []) {
    lines.push({ kind: "language", text: language.level ? `${language.name} (${language.level})` : language.name });
  }
  for (const answer of profile.followUpAnswers) lines.push({ kind: "answer", text: answer.answer, context: answer.question });

  return lines
    .map((line) => ({ ...line, text: line.text.trim() }))
    .filter((line) => line.text !== "")
    .map((line, index) => ({ id: `L${index + 1}`, ...line }));
}

export type Importance = "essential" | "desirable";

/** One requirement of the job, numbered E1, E2… (essential) and D1, D2… (desirable) for the model. */
export type JobRequirement = { id: string; text: string; importance: Importance };

export function jobRequirements(job: Job): JobRequirement[] {
  return [
    ...job.requirements.essential.map((text, index) => ({ id: `E${index + 1}`, text, importance: "essential" as const })),
    ...job.requirements.desirable.map((text, index) => ({ id: `D${index + 1}`, text, importance: "desirable" as const })),
  ];
}

export const RequirementStatusSchema = z.enum(["met", "unclear", "missing"]);
export type RequirementStatus = z.infer<typeof RequirementStatusSchema>;

/** The model's answer for one requirement (see prompts/profile-match.md). */
export const RequirementAssessmentSchema = z.object({
  /** The requirement's id, e.g. "E1". */
  id: z.string(),
  status: RequirementStatusSchema,
  /** The id of the profile line that shows it, e.g. "L4"; empty when there is none. */
  evidence: z.string(),
  /** For "unclear" and "missing": what the profile doesn't show, in one sentence to the user. */
  detail: z.string(),
});

/** The model's answer for a whole match. */
export const MatchAssessmentSchema = z.object({
  requirements: z.array(RequirementAssessmentSchema),
  /** Two or three sentences to the user on the fit, without the score. */
  reasoning: z.string(),
});
export type MatchAssessment = z.infer<typeof MatchAssessmentSchema>;

/** One requirement after checking: what was decided and, when met, the profile line that proves it. */
export type JudgedRequirement = JobRequirement & { status: RequirementStatus; evidence?: EvidenceLine; detail: string };

const defaultDetail = {
  unclear: "Your profile touches on this, but doesn’t show it clearly.",
  missing: "Nothing in your profile shows this yet.",
  noEvidence: "We couldn’t find where your profile shows this.",
  unchecked: "We couldn’t check this one against your profile.",
} as const;

/**
 * Turns the model's answer into a MatchResult. A "met" with no real profile line behind it becomes an
 * "unclear" gap (and is listed in `unsupported`, for the prompt evals). If anything had to be corrected,
 * the reasoning is written by code instead, so it never praises something the profile doesn't show.
 */
export function buildMatchResult(
  job: Job,
  profile: Profile,
  assessment: MatchAssessment,
): { match: MatchResult; judged: JudgedRequirement[]; unsupported: string[] } {
  const lines = new Map(profileEvidenceLines(profile).map((line) => [line.id, line]));
  const answers = new Map(assessment.requirements.map((answer) => [normaliseId(answer.id), answer]));
  const unsupported: string[] = [];
  let complete = true;

  const judged = jobRequirements(job).map((requirement): JudgedRequirement => {
    const answer = answers.get(requirement.id);
    if (!answer) {
      complete = false;
      return { ...requirement, status: "unclear", detail: defaultDetail.unchecked };
    }
    const evidence = lines.get(normaliseId(answer.evidence));
    if (answer.status === "met") {
      if (evidence) return { ...requirement, status: "met", evidence, detail: "" };
      unsupported.push(requirement.text);
      return { ...requirement, status: "unclear", detail: defaultDetail.noEvidence };
    }
    return { ...requirement, status: answer.status, evidence, detail: answer.detail.trim() || defaultDetail[answer.status] };
  });

  const strengths: Strength[] = judged.flatMap((item) =>
    item.status === "met" && item.evidence ? [{ requirement: item.text, evidence: item.evidence.text }] : [],
  );
  const gaps: Gap[] = judged
    .filter((item) => item.status !== "met")
    .map((item, index) => ({
      id: `gap-${index + 1}`,
      requirement: item.text,
      importance: item.importance,
      kind: item.status === "missing" ? "missing" : "unclear",
      detail: item.detail,
    }));
  const modelReasoning = assessment.reasoning.trim();

  const match = MatchResultSchema.parse({
    jobId: job.id,
    score: matchScore(judged),
    strengths,
    uncoveredRequirements: judged.filter((item) => item.status === "missing").map((item) => item.text),
    gaps,
    reasoning: complete && unsupported.length === 0 && modelReasoning ? modelReasoning : summariseMatch(judged),
  });
  return { match, judged, unsupported };
}

/** Essential requirements count three times as much as desirable ones. */
export const importanceWeight: Record<Importance, number> = { essential: 3, desirable: 1 };
/** A requirement the profile shows clearly counts in full; one it only touches on counts half. */
export const statusCredit: Record<RequirementStatus, number> = { met: 1, unclear: 0.5, missing: 0 };

/** The score from 0 to 100. An ad with no requirements scores 0: there is nothing to match. */
export function matchScore(judged: Pick<JudgedRequirement, "importance" | "status">[]): number {
  const total = judged.reduce((sum, item) => sum + importanceWeight[item.importance], 0);
  if (total === 0) return 0;
  const earned = judged.reduce((sum, item) => sum + importanceWeight[item.importance] * statusCredit[item.status], 0);
  return Math.round((100 * earned) / total);
}

/** A plain explanation of the score, written from the judged requirements alone. */
export function summariseMatch(judged: Pick<JudgedRequirement, "text" | "importance" | "status">[]): string {
  if (judged.length === 0) {
    return "We couldn’t find a list of requirements in this ad, so there is nothing to score yet. Check that you pasted the whole ad.";
  }
  const essentials = judged.filter((item) => item.importance === "essential");
  const desirables = judged.filter((item) => item.importance === "desirable");
  const met = (items: typeof judged) => items.filter((item) => item.status === "met").length;
  const open = (items: typeof judged) => items.filter((item) => item.status !== "met").map((item) => `“${item.text}”`);

  const counts = [
    essentials.length > 0 && `${met(essentials)} of the ${essentials.length} essential requirements`,
    desirables.length > 0 && `${met(desirables)} of the ${desirables.length} desirable ones`,
  ].filter(Boolean);
  const sentences = [`Your profile clearly shows ${counts.join(" and ")}.`];

  if (open(essentials).length > 0) {
    sentences.push(`The essentials to work on: ${listOf(open(essentials))}.`);
  } else if (open(desirables).length > 0) {
    sentences.push(`Every essential requirement is covered. The employer would also like ${listOf(open(desirables))}.`);
  } else {
    sentences.push("Every requirement in the ad is covered.");
  }
  return sentences.join(" ");
}

/** "A", "A and B", "A, B and C", "A, B, C and 2 more". */
function listOf(items: string[], max = 3): string {
  if (items.length > max) return `${items.slice(0, max).join(", ")} and ${items.length - max} more`;
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function normaliseId(id: string): string {
  return id.trim().toUpperCase();
}

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+(?=[A-Z0-9“"‘'(])/u);
}

// The mock answer: simple word matching, so the demo works without the model. It is cautious on purpose:
// it misses some real matches, but every "met" points at a profile line that names the requirement.

/** Words that say how much or how well, not what: they are left out when looking for a requirement. */
const FILLER = new Set(
  (
    "a an the and or of to in for with on at by as from into within across your you our we their be is are will can " +
    "able ability strong clear good great excellent proven solid advanced basic some demonstrable demonstrated relevant " +
    "previous prior experience experienced knowledge understanding skills skill working level using use years year plus " +
    "similar related background track record etc including such like interest awareness full responsibility responsible " +
    "other through large least minimum high very well both all any new subject"
  ).split(" "),
);

/** Lines that show a skill in use come first, so they are picked as evidence before a bare skills-list entry. */
const evidenceOrder: EvidenceKind[] = [
  "achievement",
  "duty",
  "project",
  "volunteering",
  "answer",
  "role",
  "summary",
  "certification",
  "education",
  "language",
  "skill",
];

/** Judges each requirement by looking for its words in the profile: the mock answer for profile-match. */
export function assessByRules(profile: Profile, job: Job): MatchAssessment {
  const lines = profileEvidenceLines(profile).sort((a, b) => evidenceOrder.indexOf(a.kind) - evidenceOrder.indexOf(b.kind));

  return {
    requirements: jobRequirements(job).map((requirement) => {
      const options = requirement.text
        .split(/\s+or\s+|[/,;]/i)
        .map(keywords)
        .filter((words) => words.length > 0);
      const found = (line: EvidenceLine, enough: (words: string[], hits: number) => boolean) =>
        options.some((words) => enough(words, words.filter((word) => mentions(line.text, word)).length));

      const proof = lines.find((line) => found(line, (words, hits) => hits === words.length));
      if (proof) return { id: requirement.id, status: "met" as const, evidence: proof.id, detail: "" };

      const related = lines.find((line) => found(line, (words, hits) => hits * 2 > words.length));
      if (related) return { id: requirement.id, status: "unclear" as const, evidence: related.id, detail: defaultDetail.unclear };

      return { id: requirement.id, status: "missing" as const, evidence: "", detail: defaultDetail.missing };
    }),
    reasoning: "",
  };
}

/** The words of a requirement worth looking for: "Strong SQL" gives "SQL"; "P&L", "C#" and "Node.js" stay whole. */
function keywords(text: string): string[] {
  const words = text
    .split(/[^\p{L}\p{N}+#&.]+/u)
    .map((word) => word.replace(/^\.+|\.+$/g, ""))
    .filter((word) => word && !FILLER.has(word.toLowerCase()));
  // Single letters only count when they are the whole requirement, like "R" or "C".
  return words.length > 1 ? words.filter((word) => word.length > 1) : words;
}

/**
 * True when a line names the word. Short words must match whole ("Git" is not "digital"); "R", "BI" and other
 * one- or two-letter names must also match in capitals. Longer words match on their start, so "managers" finds "managed".
 */
function mentions(text: string, word: string): boolean {
  let source: string;
  let flags = "iu";
  if (word.length <= 2) {
    source = escapeRegExp(word);
    flags = "u";
  } else if (word.length <= 5) {
    const singular = /[^s]s$/i.test(word) && word.length > 3 ? word.slice(0, -1) : word;
    source = `${escapeRegExp(singular)}s?`;
  } else {
    source = `${escapeRegExp(word.slice(0, 4))}[\\p{L}\\p{N}]*`;
  }
  return new RegExp(`(^|[^\\p{L}\\p{N}])${source}($|[^\\p{L}\\p{N}])`, flags).test(text);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
