// The home page's example (#176, docs/design/paper-desk): Sara's first sample job beside her CV, with the lines Tailor
// changed. Everything comes from the sample data and the sample proposal, so the page shows what the product really
// does: a requirement her CV shows is Matched, one her own answer covers is Tailored with the number of the CV line it
// changed, and anything else is Not on your CV, and stays off it.
import { sampleProposals } from "@/features/tailor";
import { cvLines } from "@/features/tailor/nothing-invented";
import type { RequirementGroup, RequirementStatus } from "@/shared/ui";
import { personas } from "@/shared/sample-data";

const sara = personas.sara;
const job = sara.jobs[0];
const changes = sampleProposals.sara.changes;
const saraLines = new Set(cvLines(sara.profile));

export type Evidence =
  /** `verbatim` is true when the quote is one line of the CV word for word; otherwise it is the match's own summary. */
  | { from: "cv"; quote: string; verbatim: boolean }
  /** `before` is the CV's line before the change, when the answer rewrote one rather than adding a new one. */
  | { from: "answer"; quote: string; before: string | null }
  | { from: "none"; suggestion: string | null };

export type MatchRow = { text: string; need: "Essential" | "Desirable"; status: RequirementStatus; line?: number; evidence: Evidence };

/** The number of the CV line each change made: 1, 2, … in the proposal's order. */
function lineOf(requirement: string): { line: number; change: (typeof changes)[number] } | null {
  const index = changes.findIndex((change) => sara.match.gaps.find((gap) => gap.id === change.gapId)?.requirement === requirement);
  return index === -1 ? null : { line: index + 1, change: changes[index] };
}

function rowFor(text: string, need: MatchRow["need"]): MatchRow {
  const strength = sara.match.strengths.find((item) => item.requirement === text);
  if (strength) return { text, need, status: "matched", evidence: { from: "cv", quote: strength.evidence, verbatim: saraLines.has(strength.evidence) } };
  const tailored = lineOf(text);
  if (tailored) {
    const { line, change } = tailored;
    return { text, need, status: "tailored", line, evidence: { from: "answer", quote: change.evidence, before: change.before } };
  }
  const gap = sara.match.gaps.find((item) => item.requirement === text);
  const nextStep = sampleProposals.sara.nextSteps.find((step) => step.gapId === gap?.id);
  return { text, need, status: "missing", evidence: { from: "none", suggestion: nextStep?.suggestion ?? null } };
}

/** Every requirement in the ad, Essential first, as the match table shows it. */
export const matchRows: MatchRow[] = [
  ...job.requirements.essential.map((text) => rowFor(text, "Essential")),
  ...job.requirements.desirable.map((text) => rowFor(text, "Desirable")),
];

/** The job ad card beside the CV: the same requirements and numbers, without the notes. */
export const requirementGroups: RequirementGroup[] = (["Essential", "Desirable"] as const).map((need) => ({
  title: need,
  items: matchRows.filter((row) => row.need === need).map(({ text, status, line }) => ({ text, status, ...(line && { line }) })),
}));

const month = (value: string | null | undefined) =>
  value ? new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}-01T00:00:00Z`)) : "";

const role = sara.profile.experience[0];
const rewritten = new Map(changes.flatMap((change, index) => (change.before ? [[change.before, { text: change.after, line: index + 1 }] as const] : [])));
const study = sara.profile.education[0];

/** The part of Sara's CV the page shows, with each tailored line and its number. */
export const cv = {
  name: sara.profile.fullName,
  contact: [sara.profile.contact.location, sara.profile.contact.email].filter(Boolean).join(" · "),
  role: {
    heading: `${role.title}, ${role.company}`,
    dates: [month(role.startDate), month(role.endDate)].filter(Boolean).join(" – "),
    lines: [...role.duties, ...role.achievements].map((text) => rewritten.get(text) ?? { text, line: undefined }),
  },
  skills: sara.profile.skills.join(", "),
  addedSkills: changes.flatMap((change, index) => (change.section === "skills" && change.before === null ? [{ text: change.after, line: index + 1 }] : [])),
  education: { heading: [study.qualification, study.subject].filter(Boolean).join(" "), detail: [study.institution, study.grade].filter(Boolean).join(" · ") },
};

const pounds = (value: number) => `£${value.toLocaleString("en-GB")}`;

/** The job ad card's header. */
export const ad = {
  title: job.title,
  company: job.company,
  details: [
    job.location,
    job.salary?.min && job.salary.max ? `${pounds(job.salary.min)} to ${pounds(job.salary.max)}` : null,
    job.workMode ? job.workMode[0].toUpperCase() + job.workMode.slice(1) : null,
  ].filter(Boolean) as string[],
};

export const example = { firstName: sara.profile.fullName.split(" ")[0], fullName: sara.profile.fullName, job: job.title, company: job.company };
