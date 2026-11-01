// The tailored CV: the user's Profile with only their approved changes applied (You approve everything).
// Pure code, shared by the preview and the PDF and Word export.
import type { Job, Profile, TailoringChange } from "@/shared/contracts";
import { bigSixTarget, isBigSix } from "./big-six";
import { normalise } from "./nothing-invented";

/** One line of the tailored CV; `tailored` marks a line that came from an approved change. */
export type CvLine = {
  text: string;
  tailored: boolean;
  /** Printed in bold before the text, e.g. the main skill a line shows: "Communication:" before "Walked managers through…". */
  label?: string;
};

/** The section headings of the CV, in order, the same in the preview and the files. */
export const cvHeadings = {
  summary: "PROFESSIONAL SUMMARY",
  skills: "SKILLS",
  experience: "WORK EXPERIENCE",
  education: "EDUCATION",
  other: "CERTIFICATES AND TOOLS",
  certificates: "Certificates:",
  drivingLicence: "Driving licence:",
  tools: "Tools:",
};

export type TailoredCv = {
  fullName: string;
  /** The title of the user's latest role, from their own CV, under the name. Empty when the CV has no role. */
  headline: string;
  /** The contact details in up to two lines: where the user lives, then how to reach them. */
  contact: string[];
  summary: CvLine | null;
  /** At most six main skills such as Communication, never tools: those the user approved, then those the CV lists, what the job asks for first. */
  skills: CvLine[];
  /** Up to four skills that are not main skills, such as software and tools, the most relevant first, listed as "Tools" in the last section of the CV. */
  technicalSkills: CvLine[];
  experience: {
    title: string;
    company: string;
    dates: string;
    lines: CvLine[];
  }[];
  education: CvLine[];
  certifications: CvLine[];
  drivingLicences: CvLine[];
  /** Approved changes whose `before` line is not on the CV (or was already changed), so they could not be placed. */
  unplaced: TailoringChange[];
  /** Lines the user approved that did not fit the limits on skills, tools and certificates, so the page can say so. */
  overLimit: string[];
};

const month = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

/** "2024-06" becomes "Jun 2024"; null means the user still works there. */
export function formatMonth(value: string | null | undefined): string {
  if (value === null) return "Present";
  if (!value) return "";
  return month.format(new Date(`${value}-01T00:00:00Z`));
}

function same(a: string, b: string): boolean {
  return normalise(a) === normalise(b);
}

/** An education entry as one CV line, e.g. "MSc, Data Science, University of Manchester, Merit". */
function educationLine(item: Profile["education"][number]): string {
  return [item.qualification, item.subject, item.institution, item.grade].filter(Boolean).join(", ");
}

/** A certificate as one CV line, e.g. "Tableau Desktop Specialist, Tableau, 2023". */
function certificationLine(item: Profile["certifications"][number]): string {
  return [item.name, item.issuer, item.year].filter(Boolean).join(", ");
}

function wordsIn(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9+#.]*[a-z0-9+#]/g) ?? [];
}

/** True when the ad asks for this main skill, by word stem, so "communicating" counts as Communication. */
function mentions(skill: string, adWords: string[]): boolean {
  const words = wordsIn(skill).filter((word) => !["and", "of", "the"].includes(word));
  return words.length > 0 && words.every((word) => adWords.some((adWord) => adWord.startsWith(word.slice(0, 5))));
}

/** The main skills the CV lists that this ad asks for: these keep their place in the six, so suggestions fill only the rest. */
export function listedSkillsTheAdAsksFor(profile: Profile, job: Job): string[] {
  const adWords = wordsIn([job.description, ...job.requirements.essential, ...job.requirements.desirable].join(" "));
  return profile.skills.filter((skill) => isBigSix(skill) && mentions(skill, adWords));
}

/** Words too common in job ads to say anything about a CV line. */
const commonAdWords = new Set(["ability", "able", "all", "and", "are", "experience", "for", "good", "has", "have", "knowledge", "our", "skills", "strong", "the", "understanding", "with", "working", "you", "your"]);

/** The last section stays short: only the most relevant tools and certificates reach the CV, the rest stay in the Profile. */
export const maxTools = 4;
export const maxCertificates = 4;

/** Most relevant first; the order stays as the CV has it when lines are equally relevant. */
function relevantLinesFirst(lines: CvLine[], job: Job | undefined, wholeAd = false): CvLine[] {
  const keywords = (text: string) => new Set(wordsIn(text).filter((word) => word.length > 2 && !commonAdWords.has(word)));
  const asked = keywords(job ? [...job.requirements.essential, ...job.requirements.desirable].join(" ") : "");
  const inAd = job && wholeAd ? keywords(job.description) : new Set<string>();
  const overlap = (line: CvLine, words: Set<string>) => [...keywords(line.text)].filter((word) => words.has(word)).length;
  // A requirement outweighs a passing mention elsewhere in the ad.
  const score = (line: CvLine) => (line.tailored ? 1000 : 0) + overlap(line, asked) * 10 + overlap(line, inAd);
  return [...lines].sort((a, b) => score(b) - score(a));
}

/** A driving licence the CV names, under whichever section the CV had it. */
function isDrivingLicence(line: CvLine): boolean {
  return /driving licen[cs]e|driver'?s licen[cs]e/i.test(line.text);
}

/** "Full UK driving licence" becomes "Full UK", as the line already says "Driving licence:". */
function licenceDetail(line: CvLine): CvLine {
  const detail = line.text.replace(/\s*(driving|driver'?s) licen[cs]e\s*/i, " ").replace(/[\s,–-]+$/, "").trim();
  return detail ? { ...line, text: detail } : line;
}

/** The CV's lines in one section, exactly as the tailored CV shows them: a change's `before` must be one of these. */
export function sectionLines(profile: Profile, section: TailoringChange["section"]): string[] {
  switch (section) {
    case "summary":
      return profile.summary.trim() ? [profile.summary] : [];
    case "skills":
      return profile.skills;
    case "experience":
      return profile.experience.flatMap((job) => [...job.duties, ...job.achievements]);
    case "education":
      return profile.education.map(educationLine);
    case "certifications":
      return profile.certifications.map(certificationLine);
  }
}

/** True when the change can go into this CV: a new line, or a `before` that is one of the section's lines. */
export function fitsCv(profile: Profile, change: Pick<TailoringChange, "section" | "before">): boolean {
  const { before } = change;
  return before === null || sectionLines(profile, change.section).some((line) => same(line, before));
}

/**
 * Builds the CV from the Profile and the changes. Changes that are not approved are ignored entirely.
 * An approved change replaces its `before` line where it finds it; a new line (before: null) is added to its section.
 * An approved change that finds no line is never dropped silently: it is listed in `unplaced` for the page to show.
 * With a job, the skills are at most six main skills, approved ones first, then those on the CV; the relevant work lines come first in each role.
 */
export function buildTailoredCv(profile: Profile, changes: TailoringChange[], job?: Job): TailoredCv {
  const approved = changes.filter((change) => change.status === "approved");
  const used = new Set<string>();

  /** Swaps a CV line for its approved change, if there is one. */
  const apply = (text: string, section: TailoringChange["section"]): CvLine => {
    const change = approved.find((item) => item.section === section && !used.has(item.id) && item.before !== null && same(item.before, text));
    if (!change) return { text, tailored: false };
    used.add(change.id);
    return { text: change.after, tailored: true };
  };
  const added = (section: TailoringChange["section"], max = Infinity): CvLine[] =>
    approved
      .filter((change) => change.section === section && change.before === null && !used.has(change.id))
      .slice(0, max)
      .map((change) => (used.add(change.id), { text: change.after, tailored: true }));

  // Approving a main skill also marks the CV line that shows it, as the template does.
  const shown = approved.filter((change) => change.section === "skills" && change.before === null && change.evidenceSource === "cv" && isBigSix(change.after));
  const withSkill = (original: string, line: CvLine): CvLine => {
    const skill = shown.find((change) => normalise(original).includes(normalise(change.evidence)));
    return skill ? { ...line, label: `${skill.after.trim()}:` } : line;
  };

  const summary = profile.summary.trim() ? apply(profile.summary, "summary") : (added("summary", 1)[0] ?? null);

  const experience = profile.experience.map((role) => ({
    title: role.title,
    company: role.company,
    dates: [formatMonth(role.startDate), formatMonth(role.endDate)].filter(Boolean).join(" – "),
    lines: [...role.duties, ...role.achievements].map((line) => withSkill(line, apply(line, "experience"))),
  }));
  // A new experience line has no role to sit under, so it goes under the most recent one.
  if (experience[0]) experience[0].lines.push(...added("experience"));
  for (const role of experience) role.lines = relevantLinesFirst(role.lines, job);

  const allSkills = [...profile.skills.map((skill) => apply(skill, "skills")), ...added("skills")];
  const essentialWords = job ? wordsIn(job.requirements.essential.join(" ")) : [];
  const desirableWords = job ? wordsIn(job.requirements.desirable.join(" ")) : [];
  const adWords = job ? wordsIn(job.description) : [];
  // Only main skills such as Communication can be in the six; software and tools never are. First those the user approved, each resting on
  // a line of their own (Nothing invented), then those the CV lists: what the ad asks for first, the rest to fill the row. Nothing else.
  const rank = (line: CvLine): number => {
    if (line.tailored) return 0;
    if (mentions(line.text, essentialWords)) return 1;
    if (mentions(line.text, desirableWords)) return 2;
    return mentions(line.text, adWords) ? 3 : 4;
  };
  const mainSkills = allSkills.filter((line) => isBigSix(line.text) && (job !== undefined || line.tailored));
  const skills = [...mainSkills].sort((a, b) => rank(a) - rank(b)).slice(0, bigSixTarget);
  // A main skill that did not make the six stays in the Profile; it is not a tool. An approved one is reported to the user, never lost silently.
  const leftOut = mainSkills.filter((line) => !skills.includes(line));
  const otherSkills = allSkills.filter((line) => !isBigSix(line.text) && !isDrivingLicence(line));
  const tools = relevantLinesFirst(otherSkills, job, true);
  const technicalSkills = tools.slice(0, maxTools);
  // Laid out as the template: "MSc (Data Science), Merit." in bold, then the institution. A tailored line stays as approved.
  const education = profile.education.map((item) => {
    const line = apply(educationLine(item), "education");
    if (line.tailored) return line;
    const degree = `${item.qualification}${item.subject ? ` (${item.subject})` : ""}${item.grade ? `, ${item.grade}` : ""}.`;
    return { ...line, label: degree, text: item.institution };
  });
  const certifications = profile.certifications.map((item) => {
    const line = apply(certificationLine(item), "certifications");
    if (line.tailored) return line;
    return { ...line, text: `${item.name}${item.issuer ? ` – ${item.issuer}` : ""}${item.year ? ` (${item.year})` : ""}` };
  });

  const allCertificates = [...certifications, ...added("certifications")];
  const certificates = relevantLinesFirst(allCertificates.filter((line) => !isDrivingLicence(line)), job, true);

  return {
    fullName: profile.fullName,
    headline: experience[0]?.title ?? "",
    contact: [profile.contact.location, [profile.contact.email, profile.contact.phone, profile.contact.linkedIn].filter(Boolean).join(" | ")].filter((line): line is string => Boolean(line)),
    summary,
    skills,
    technicalSkills,
    experience,
    education: [...education, ...added("education")],
    certifications: certificates.slice(0, maxCertificates),
    drivingLicences: [...allCertificates, ...allSkills].filter(isDrivingLicence).map(licenceDetail),
    unplaced: approved.filter((change) => !used.has(change.id)),
    overLimit: [...leftOut, ...tools.slice(maxTools), ...certificates.slice(maxCertificates)].filter((line) => line.tailored).map((line) => line.text),
  };
}

/** The last section of the CV: one labelled line each for certificates, driving licences and tools, the same in the preview and the files. */
export function otherLines(cv: TailoredCv): CvLine[] {
  const groups: [string, CvLine[], string][] = [
    [cvHeadings.certificates, cv.certifications, "; "],
    [cvHeadings.drivingLicence, cv.drivingLicences, "; "],
    [cvHeadings.tools, cv.technicalSkills, ", "],
  ];
  return groups
    .filter(([, lines]) => lines.length > 0)
    .map(([label, lines, separator]) => ({ label, text: lines.map((line) => line.text).join(separator), tailored: lines.some((line) => line.tailored) }));
}
