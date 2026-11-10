// The cover letter: built only from the CV, the approved changes and the user's own answers (Nothing invented),
// in their own words (Sounds like you). The user edits and approves it before it is used anywhere.
import { z } from "zod";
import type { Gap, Job, Profile, TailoringChange } from "@/shared/contracts";
import { askModel, loadPrompt, type Requester } from "@/shared/ai";
import { jobForPrompt } from "./job-for-prompt";
import { isStrongerGap } from "./gap-questions";
import { cvLines, normalise, requirementTerms, roleClaimAdded, type EvidenceSources } from "./nothing-invented";
import { buildTailoredCv } from "./tailored-cv";
import type { GapAnswer } from "./types";

export const CoverLetterSchema = z.object({
  greeting: z.string().min(1),
  paragraphs: z.array(z.string().min(1)).min(1).max(6),
  signOff: z.string().min(1),
});
export type CoverLetter = z.infer<typeof CoverLetterSchema>;

export type CoverLetterInput = {
  profile: Profile;
  job: Job;
  /** Only approved changes are used; anything else is ignored. */
  changes: TailoringChange[];
  answers: GapAnswer[];
  /** The requirements of gaps the user said no to, which the letter must not name, not even as what the employer wants. */
  declined?: string[];
  /** What the last draft named from `declined`, when this is a second attempt. */
  namedInLastDraft?: string[];
  /**
   * "Make it stronger" questions the user had nothing more to add to: the CV line stays usable, but what the question
   * asked about must not be added to it (#315). Kept apart from `declined`, so the CV line's own words are never blocked.
   */
  nothingMore?: NothingMore[];
  /** Whose daily limit the request counts against: { userId } for a signed-in user. */
  requester?: Requester;
};

/** A "Make it stronger" question the user said no to, with the CV line it was about. */
export type NothingMore = { question: string; cvLine: string };

/**
 * The "Make it stronger" questions the user had nothing more to add to, each with the CV line it was about,
 * taken from the gap's detail (`Already shown by: "…"`).
 */
export function nothingMoreToAdd(gaps: Gap[], answers: GapAnswer[]): NothingMore[] {
  return answers.flatMap((answer) => {
    const gap = !answer.hasExperience ? gaps.find((item) => item.id === answer.gapId && isStrongerGap(item)) : undefined;
    const cvLine = gap?.detail?.match(/^Already shown by: "([^]*)"$/)?.[1];
    return gap && cvLine ? [{ question: answer.question.trim() || gap.requirement, cvLine }] : [];
  });
}

/** The closing line of every letter; only the code adds it and the name, so neither can appear twice. */
export const letterSignOff = "Yours sincerely,";

/** A paragraph that is really a closing line or the name, which a model sometimes adds to the body. */
function isClosing(paragraph: string, fullName: string): boolean {
  const text = paragraph.trim().toLowerCase();
  return text === fullName.trim().toLowerCase() || /^(yours (faithfully|sincerely)|sincerely|kind regards|best regards|regards)\b[,.]?(\s|$)/.test(text);
}

/** The letter as plain text, the form the user edits and the export uses. It ends with one closing line and one name. */
export function coverLetterText(letter: CoverLetter, fullName: string): string {
  const body = letter.paragraphs.filter((paragraph) => !isClosing(paragraph, fullName));
  return [letter.greeting, ...body, `${letterSignOff}\n\n${fullName}`].join("\n\n");
}

function asSentence(line: string): string {
  const text = line.trim().replace(/[.;]+$/, "");
  return `I ${text[0].toLowerCase()}${text.slice(1)}.`;
}

function list(items: string[]): string {
  return items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/**
 * The mock letter: put together from the user's own lines only, so it is honest by construction.
 * The live letter comes from prompts/tailor-cover-letter.md.
 */
export function sampleCoverLetter({ profile, job, changes }: CoverLetterInput): CoverLetter {
  // The tailored CV already swaps each line for its approved change, so no line appears twice.
  const cv = buildTailoredCv(profile, changes, job);
  const recent = profile.experience[0];
  const recentLines = cv.experience[0]?.lines ?? [];
  const lines = [...recentLines.filter((line) => line.tailored), ...recentLines.filter((line) => !line.tailored)]
    .map((line) => line.text)
    .slice(0, 3);
  const allSkills = [...cv.skills, ...cv.technicalSkills];
  const skills = [...allSkills.filter((line) => line.tailored), ...allSkills.filter((line) => !line.tailored)]
    .map((line) => line.text)
    .slice(0, 5);

  const paragraphs = [
    `I am applying for the ${job.title} role at ${job.company}. ${profile.summary.trim()}`,
    recent && lines.length > 0 ? `As ${recent.title} at ${recent.company}: ${lines.map(asSentence).join(" ")}` : "",
    skills.length > 0 ? `The skills I would bring include ${list(skills)}.` : "",
    "I would welcome the chance to talk about the role at an interview.",
  ].filter(Boolean);

  return { greeting: "Dear Hiring Manager,", paragraphs, signOff: letterSignOff };
}

/**
 * Words the letter must not contain: the requirements of gaps the user said they have not done.
 * A letter that mentions one of them is not used (Nothing invented). Only the CV lines and the user's
 * follow-up answers count as evidence, not the rest of the Profile: preferences say what the user wants,
 * so "Move into team leadership" must not let a letter claim team leadership (#164).
 */
export function inventedTerms(letter: string, gaps: Gap[], answers: GapAnswer[], profile: Profile): string[] {
  const text = normalise(letter);
  const cv = normalise([...cvLines(profile), ...profile.followUpAnswers.map((item) => item.answer)].join("\n"));
  return answers
    .filter((answer) => !answer.hasExperience)
    .flatMap((answer) => {
      const gap = gaps.find((item) => item.id === answer.gapId);
      return gap ? requirementTerms(gap.requirement) : [];
    })
    .filter((term) => text.includes(term) && !cv.includes(term));
}

/** The requirements of the gaps the user said no to and that their CV does not show, for the letter to leave out. */
export function declinedRequirements(gaps: Gap[], answers: GapAnswer[], profile: Profile): string[] {
  return gaps
    .filter((gap) => answers.some((answer) => answer.gapId === gap.id && !answer.hasExperience))
    .filter((gap) => inventedTerms(gap.requirement, gaps, answers, profile).length > 0)
    .map((gap) => gap.requirement);
}

/** The letter without the sentences `drop` picks. A full stop ends a sentence only before a space, so "2.1%" stays whole. Empty paragraphs go too. */
function withoutSentences(letter: CoverLetter, drop: (sentence: string) => boolean): CoverLetter {
  const paragraphs = letter.paragraphs
    .map((paragraph) =>
      paragraph
        .split(/(?<=[.!?])\s+/)
        .filter((sentence) => !drop(sentence))
        .join(" ")
        .trim(),
    )
    .filter(Boolean);
  return { ...letter, paragraphs };
}

/**
 * The letter without any sentence that names one of these terms, for a model that keeps naming what the user said no to.
 * The user reads and approves the letter, so a shorter honest letter is better than none.
 */
export function withoutSentencesNaming(letter: CoverLetter, terms: string[]): CoverLetter {
  return withoutSentences(letter, (sentence) => terms.some((term) => normalise(sentence).includes(term)));
}

/** The ad's registration or Band that a sentence claims for the person, with the job's own title taken out first (#424). */
function roleClaimIn(sentence: string, jobTitle: string, sources: EvidenceSources): string | null {
  const title = jobTitle.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const withoutTitle = title ? sentence.replace(new RegExp(title, "gi"), " ") : sentence;
  return roleClaimAdded({ section: "summary", before: null, after: withoutTitle, evidence: "", evidenceSource: "cv" }, sources);
}

/**
 * The letter without any sentence that claims the ad's registration (e.g. "NMC") or numbered Band (e.g. "Band 6") when
 * nothing the user gave about themselves supports it (#424), checked as roleClaimAdded checks a CV change. Naming the
 * job is fine: "I am applying for the Senior Staff Nurse (Band 6) post" stays, "As an NMC registered nurse" goes.
 * `claims` says what was taken out.
 */
export function withoutRoleClaims(letter: CoverLetter, jobTitle: string, sources: EvidenceSources): { letter: CoverLetter; claims: string[] } {
  const claims = new Set<string>();
  const trimmed = withoutSentences(letter, (sentence) => {
    const claim = roleClaimIn(sentence, jobTitle, sources);
    if (claim) claims.add(claim);
    return claim !== null;
  });
  return { letter: trimmed, claims: [...claims] };
}

export async function writeCoverLetter(input: CoverLetterInput): Promise<CoverLetter> {
  const { profile, job, changes, answers } = input;
  const prompt = await loadPrompt("tailor-cover-letter", {
    job: jobForPrompt(job, { withAd: true }),
    cv: JSON.stringify(
      {
        fullName: profile.fullName,
        summary: profile.summary,
        skills: profile.skills,
        experience: profile.experience,
        education: profile.education,
        certifications: profile.certifications,
        languages: profile.languages,
        projects: profile.projects,
        followUpAnswers: profile.followUpAnswers.map(({ question, answer }) => ({ question, answer })),
      },
      null,
      2,
    ),
    approvedChanges: JSON.stringify(
      changes.filter((change) => change.status === "approved").map(({ section, before, after }) => ({ section, before, after })),
      null,
      2,
    ),
    answers: JSON.stringify(answers, null, 2),
    declined: JSON.stringify({ requirements: input.declined ?? [], namedInLastDraft: input.namedInLastDraft ?? [] }, null, 2),
    nothingMore: JSON.stringify(input.nothingMore ?? [], null, 2),
  });

  return askModel({
    feature: "tailor-cover-letter",
    prompt,
    schema: CoverLetterSchema,
    sample: sampleCoverLetter(input),
    requester: input.requester,
  });
}
