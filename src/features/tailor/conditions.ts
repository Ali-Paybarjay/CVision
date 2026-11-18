// The job's conditions (#222), such as a driving licence, a DBS check or night shifts, in the tailor's checks (#526).
// Since #497 they are not gaps, so the Nothing invented check does not see them: without this, a CV suggestion could end
// "…, with a full UK driving licence." Pure code with no model call.
import { jobConditions } from "@/features/profile/job-conditions";
import type { Job, JobConditionKind } from "@/shared/contracts";
import { normalise } from "./nothing-invented";
import type { GapAnswer, ProposedChange, RejectedChange } from "./types";

/**
 * What a credential or a sensitive condition is about, in any words: a line that matches one claims it. The same topics
 * as the job reader's backup word list (features/profile/job-conditions.ts), so "holding a full clean UK driving
 * licence", "as a UK driving licence holder", "with a current enhanced DBS" and "eligible to work in the UK" all count.
 */
const topics: RegExp[] = [
  /\bdriv(?:ing|er'?s?)\s+licen[cs]e|\b(?:full|clean)(?:\s+clean|\s+full)?(?:\s+uk)?(?:\s+manual)?\s+licen[cs]e\b(?!\s+to\s+practi[cs]e)|\b(?:hgv|lgv|c\+e|class [12])\s+licen[cs]e|\bab(?:le|ility) to drive\b|\blicen[cs]ed driver\b/,
  /\bdbs\b|\bpvg\b|\bcriminal record|\b(?:basic|standard|enhanced) disclosure\b/,
  /\bright to work\b|\b(?:eligib\w*|entitle\w*|permission|permitted|free) to work\b|\bwork permit\b|\bvisa\b|\bsponsorship\b|\bsettled status\b/,
  /\bsecurity (?:clearance|vetting|cleared)\b|\bbpss\b|\b(?:sc|dv|ctc)[- ](?:clearance|cleared|vetting|vetted)\b|\bvetting\b|\bvetted\b/,
  /\bcscs\b/,
  /\bsia\b/,
  /\bcpcs\b/,
  /\bfork[- ]?lift|\bflt\b|\bcounterbalance\b|\breach truck\b/,
];

/** Stems of a working condition: "Shift work, including nights" is shown by "night shifts" on the CV. */
const workingStems = /\b(?:shift|night|weekend|evening|bank holiday|on[- ]call|rota\b|unsocial|travel|relocat|overnight|cars?\b|vehicle|driv)/g;

/** A clause that says the condition is not held now: "Working towards a full UK driving licence", "DBS applied for". */
const notHeld =
  /\b(?:not|no|never|working towards|appl(?:y|ies|ied|ying|ication)|pending|awaiting|required|requires?|need(?:s|ed)?|sponsorship|provisional|learn(?:ing|er)|expired|lapsed|will|once|until|due|hop(?:e|ing)|plan(?:s|ning)?)\b|n't\b/;

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type JobConditionCheck = {
  requirement: string;
  kind: JobConditionKind;
  /** Whether a text claims the condition. */
  claims: (text: string) => boolean;
};

/**
 * How a text claims the condition: its topic, or else the whole condition or one side of an "or" or a slash as whole
 * words, never one part of a comma list ("Full, clean UK driving licence" is not claimed by "fully"). A working
 * condition is claimed by its stems too.
 */
function checkFor(requirement: string, kind: JobConditionKind): JobConditionCheck {
  const text = normalise(requirement);
  const own = topics.filter((topic) => topic.test(text));
  const phrases = text
    .split(/\s+or\s+|\//)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2)
    .map((part) => new RegExp(`(?<![a-z0-9])${escaped(part)}(?![a-z0-9])`));
  const stems: string[] = kind === "working" ? [...new Set(text.match(workingStems) ?? [])] : [];
  const stemsIn = (line: string): string[] => line.match(workingStems) ?? [];
  const claims = (line: string) =>
    own.length > 0 ? own.some((topic) => topic.test(line)) : phrases.some((phrase) => phrase.test(line)) || stems.some((stem) => stemsIn(line).includes(stem));
  return { requirement, kind, claims };
}

/** Whether a line shows the condition held now: a clause that claims it and says nothing about not holding it. */
const shows = (check: JobConditionCheck, line: string) => normalise(line).split(/[,;.]/).some((clause) => check.claims(clause) && !notHeld.test(clause));

/** A tap is saved as "Yes, I have done this at work: <the requirement>." That part repeats the ad, not the user. */
const ownWords = (answer: string) => answer.replace(/^yes, i have done this (?:at work|in study or on my own): [^\n]*?\.(?:\s|$)/i, "");

/**
 * The job's conditions that the match did not judge as a gap or a strength and that nothing the user gave shows: a CV
 * line, a follow-up answer, or the words of a yes answer.
 */
export function conditionsNotShown(job: Job, judged: string[], lines: string[], answers: GapAnswer[] = []): JobConditionCheck[] {
  const seen = new Set(judged);
  const said = [...lines, ...answers.filter((answer) => answer.hasExperience).map((answer) => ownWords(answer.answer))];
  return jobConditions(job)
    .filter(({ requirement }) => !seen.has(requirement))
    .map(({ requirement, kind }) => checkFor(requirement, kind))
    .filter((check) => !said.some((line) => shows(check, line)));
}

/**
 * Without the changes that claim a credential or a sensitive condition, such as a driving licence, a DBS check or the
 * right to work, that the line they rewrite does not have. A working condition such as night shifts is only listed in
 * the prompt: "Worked day and night shifts" may become "Worked day and night shift work".
 */
export function withoutConditionsAdded(changes: ProposedChange[], conditions: JobConditionCheck[]): { kept: ProposedChange[]; removed: RejectedChange[] } {
  const guarded = conditions.filter((check) => check.kind !== "working");
  const kept: ProposedChange[] = [];
  const removed: RejectedChange[] = [];
  for (const change of changes) {
    const after = normalise(change.after);
    const before = normalise(change.before ?? "");
    const added = guarded.find((check) => check.claims(after) && !check.claims(before));
    if (added) removed.push({ change, reason: `It adds "${added.requirement}", which the CV does not show.` });
    else kept.push(change);
  }
  return { kept, removed };
}
