// The tailored CV: the user's Profile with only their approved changes applied (You approve everything).
// Pure code, shared by the preview and the PDF and Word export.
import type { Job, Profile, TailoringChange } from "@/shared/contracts";
import { bigSixTarget, isBigSix, nearSameSkill } from "./big-six";
import { normalise } from "./nothing-invented";

/** One line of the tailored CV; `tailored` marks a line that came from an approved change. */
export type CvLine = {
  text: string;
  tailored: boolean;
  /** Printed in bold before the text; only the labels of the last section use it: "Certificates:", "Driving licence:", "Tools:". */
  label?: string;
};

/** The section headings of the CV, in order, the same in the preview and the files. */
export const cvHeadings = {
  summary: "PROFESSIONAL SUMMARY",
  skills: "SKILLS",
  experience: "WORK EXPERIENCE",
  projects: "PROJECTS",
  education: "EDUCATION",
  other: "CERTIFICATES AND TOOLS",
  certificates: "Certificates:",
  languages: "Languages:",
  drivingLicence: "Driving licence:",
  tools: "Tools:",
};

/** A job or project on the CV. `company` is empty when the CV names no organisation. */
export type CvEntry = {
  title: string;
  company: string;
  dates: string;
  lines: CvLine[];
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
  experience: CvEntry[];
  education: CvLine[];
  certifications: CvLine[];
  drivingLicences: CvLine[];
  /** Projects and languages as the Profile has them: they take no tailoring changes yet. Volunteering is not on the CV in this phase. */
  projects: CvEntry[];
  /** Listed as "Languages" in the last section of the CV, under the certificates. */
  languages: CvLine[];
  /** Approved changes whose `before` line is not on the CV (or was already changed), so they could not be placed. */
  unplaced: TailoringChange[];
  /** Those of `unplaced` whose line is on the CV but already taken by another approved change to it (#272). */
  sameLine: TailoringChange[];
  /** Lines the user approved that did not fit the limits on skills, tools and certificates, so the page can say so. */
  overLimit: string[];
  /**
   * Skills from the Profile, not approved changes, that did not fit the six main skills and four tools, so the page
   * can name them rather than leave them off without a word (#190). A main skill left out only because one almost the
   * same is on the CV is not among them. They stay in the Profile.
   */
  leftInProfile: string[];
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

/** Lower case words only, so "Hartley's" and "Hartley’s" match and "EE" is not found inside "engineering". */
const asWords = (text: string) => ` ${normalise(text).replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;

/**
 * The role a new work line goes under (#446), as an index into `profile.experience`, or -1 when there is none. The
 * roles whose company the evidence names (all of them if it names none); of those, the one whose title it names, the
 * longest title first, so "Deputy Store Manager at Hartley's" is not read as "Store Manager"; otherwise the most recent.
 */
export function roleForNewLine(profile: Profile, change: Pick<TailoringChange, "evidence">): number {
  const evidence = asWords(change.evidence);
  const names = (name: string) => asWords(name).trim() !== "" && evidence.includes(asWords(name));
  const roles = profile.experience.map((role, index) => ({ ...role, index }));
  const atCompany = roles.filter((role) => names(role.company));
  const pool = atCompany.length > 0 ? atCompany : roles;
  const byTitle = pool.filter((role) => names(role.title)).sort((a, b) => b.title.length - a.title.length);
  return (byTitle[0] ?? pool[0])?.index ?? -1;
}

/** "Customer Assistant (part-time), Greenway Foods": the role a new work line goes under, for its card. */
export function newLineRole(profile: Profile, change: TailoringChange): string | undefined {
  if (change.section !== "experience" || change.before !== null) return undefined;
  const role = profile.experience[roleForNewLine(profile, change)];
  return role ? `${role.title}, ${role.company}` : undefined;
}

/** Two changes to the same CV line: only one of them can be on the CV. A CV has one summary, so two summaries always are (#465). */
function sameTarget(a: TailoringChange, b: TailoringChange): boolean {
  if (a.id === b.id || a.section !== b.section) return false;
  if (a.section === "summary") return true;
  return a.before !== null && b.before !== null && same(a.before, b.before);
}

/**
 * The changes after the user approves `next`: an earlier approved change to the same line goes back to "proposed",
 * because only one change per line can be on the CV (#272). `sentBack` lists those, for the page to save and say so.
 */
export function approveOnePerLine(changes: TailoringChange[], next: TailoringChange): { changes: TailoringChange[]; sentBack: TailoringChange[] } {
  const sentBack =
    next.status === "approved"
      ? changes.filter((change) => change.status === "approved" && sameTarget(change, next)).map((change) => ({ ...change, status: "proposed" as const }))
      : [];
  return {
    changes: changes.map((change) => (change.id === next.id ? next : (sentBack.find((item) => item.id === change.id) ?? change))),
    sentBack,
  };
}

/** An education entry as one CV line, e.g. "MSc, Data Science, University of Manchester, Merit". */
function educationLine(item: Profile["education"][number]): string {
  return [item.qualification, item.subject, item.institution, item.grade].filter(Boolean).join(", ");
}

/** A certificate as one CV line, e.g. "Tableau Desktop Specialist, Tableau, 2023". */
function certificationLine(item: Profile["certifications"][number]): string {
  return [item.name, item.issuer, item.year].filter(Boolean).join(", ");
}

function dateRange(start: string | null | undefined, end: string | null | undefined): string {
  return [formatMonth(start), formatMonth(end)].filter(Boolean).join(" – ");
}

/** A line the model never changes. */
function asIs(text: string): CvLine {
  return { text, tailored: false };
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

  const summary = profile.summary.trim() ? apply(profile.summary, "summary") : (added("summary", 1)[0] ?? null);

  const experience = profile.experience.map((role) => ({
    title: role.title,
    company: role.company,
    dates: dateRange(role.startDate, role.endDate),
    // Every line looks the same: no skill name in bold in front of it.
    lines: [...role.duties, ...role.achievements].map((line) => apply(line, "experience")),
  }));
  // A new experience line goes under the role its evidence names, or the most recent one (#446).
  for (const change of approved.filter((item) => item.section === "experience" && item.before === null && !used.has(item.id))) {
    const role = experience[roleForNewLine(profile, change)];
    if (!role) continue;
    used.add(change.id);
    role.lines.push({ text: change.after, tailored: true });
  }
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
  // Of two skills that are almost the same, such as "Communication" and "Stakeholder communication", only one goes in, unless
  // both were approved (#190): the one the ad asks for more, and with the same rank the more specific name.
  const skills: CvLine[] = [];
  const nearSame: CvLine[] = [];
  for (const line of [...mainSkills].sort((a, b) => rank(a) - rank(b))) {
    const twin = line.tailored ? undefined : skills.find((kept) => nearSameSkill(kept.text, line.text));
    if (!twin) {
      if (skills.length < bigSixTarget) skills.push(line);
    } else if (!twin.tailored && rank(twin) === rank(line) && line.text.length > twin.text.length) {
      skills[skills.indexOf(twin)] = line;
      nearSame.push(twin);
    } else {
      nearSame.push(line);
    }
  }
  // A main skill that did not make the six stays in the Profile; it is not a tool. An approved one is reported to the user, never lost silently.
  const leftOut = mainSkills.filter((line) => !skills.includes(line));
  const otherSkills = allSkills.filter((line) => !isBigSix(line.text) && !isDrivingLicence(line));
  const tools = relevantLinesFirst(otherSkills, job, true);
  const technicalSkills = tools.slice(0, maxTools);
  // "MSc (Data Science), Merit. University of Manchester", in plain text like every other line. A tailored line stays as approved.
  const education = profile.education.map((item) => {
    const line = apply(educationLine(item), "education");
    if (line.tailored) return line;
    const degree = `${item.qualification}${item.subject ? ` (${item.subject})` : ""}${item.grade ? `, ${item.grade}` : ""}.`;
    return { ...line, text: `${degree} ${item.institution}` };
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
    projects: (profile.projects ?? []).map((item) => ({ title: item.name, company: item.organisation ?? "", dates: dateRange(item.startDate, item.endDate), lines: item.details.map(asIs) })),
    languages: (profile.languages ?? []).map((item) => asIs(item.level ? `${item.name} (${item.level})` : item.name)),
    unplaced: approved.filter((change) => !used.has(change.id)),
    sameLine: approved.filter((change) => !used.has(change.id) && approved.some((other) => used.has(other.id) && sameTarget(other, change))),
    overLimit: [...leftOut, ...tools.slice(maxTools), ...certificates.slice(maxCertificates)].filter((line) => line.tailored).map((line) => line.text),
    leftInProfile: [...leftOut.filter((line) => !nearSame.includes(line)), ...tools.slice(maxTools)].filter((line) => !line.tailored).map((line) => line.text),
  };
}

/** The last section of the CV: one labelled line each for certificates, languages, driving licences and tools, the same in the preview and the files. */
export function otherLines(cv: TailoredCv): CvLine[] {
  const groups: [string, CvLine[], string][] = [
    [cvHeadings.certificates, cv.certifications, "; "],
    [cvHeadings.languages, cv.languages, ", "],
    [cvHeadings.drivingLicence, cv.drivingLicences, "; "],
    [cvHeadings.tools, cv.technicalSkills, ", "],
  ];
  return groups
    .filter(([, lines]) => lines.length > 0)
    .map(([label, lines, separator]) => ({ label, text: lines.map((line) => line.text).join(separator), tailored: lines.some((line) => line.tailored) }));
}
