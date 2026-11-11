// The cover letter on the Tailor page, and when an approved letter has to be read again.
// Pure code, so the page and the tests share it.
import type { Profile, TailoringChange } from "@/shared/contracts";
import type { GapAnswer } from "./types";

/** One paragraph of the letter's body and the user's decision on it: nothing stays in the letter until they keep it. */
export type LetterParagraph = { text: string; decision: "pending" | "kept" | "removed" };

/** The letter split for the user to decide on: the greeting and closing come from code, so only the body is decided on. */
export type LetterDraft = { greeting: string; paragraphs: LetterParagraph[]; closing: string };

/**
 * The cover letter as the user last left it; only an approved letter is used for export.
 * `basis` is what the letter was approved against (see letterBasis); `stale` means the CV changed since.
 * `note` says what was taken out of the letter before the user saw it (#466).
 * `draft` holds each paragraph and the user's decision while they read it; `text` is always the letter as it stands.
 */
export type LetterState = { text: string; approved: boolean; basis?: string; stale?: boolean; error?: string; draft?: LetterDraft; note?: string };

const closingLine = /^(yours (faithfully|sincerely)|sincerely|kind regards|best regards|regards)\b/i;

/**
 * The letter's text split into greeting, body paragraphs and closing (the sign-off and the name).
 * Every paragraph starts as `decision`: "pending" for a new letter, "kept" for one the user already approved.
 */
export function splitLetter(text: string, decision: LetterParagraph["decision"] = "pending"): LetterDraft {
  const blocks = text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
  const greeting = blocks[0] && /^dear\b/i.test(blocks[0]) ? blocks.shift()! : "";
  const signOff = blocks.findIndex((block) => closingLine.test(block));
  const closing = signOff === -1 ? [] : blocks.splice(signOff);
  return { greeting, paragraphs: blocks.map((block) => ({ text: block, decision })), closing: closing.join("\n\n") };
}

/** The letter as text with every paragraph the user has not removed, the form the export and Apply use. */
export function joinLetter(draft: LetterDraft): string {
  const body = draft.paragraphs.filter((paragraph) => paragraph.decision !== "removed").map((paragraph) => paragraph.text.trim());
  return [draft.greeting, ...body, draft.closing].filter(Boolean).join("\n\n");
}

/** The letter can be approved once every paragraph has a decision and at least one is kept. */
export function canApprove(draft: LetterDraft): boolean {
  return draft.paragraphs.every((paragraph) => paragraph.decision !== "pending") && draft.paragraphs.some((paragraph) => paragraph.decision === "kept");
}

/** The words in the body the letter would have now, for the count beside the paragraphs. */
export function bodyWordCount(draft: LetterDraft): number {
  return draft.paragraphs
    .filter((paragraph) => paragraph.decision !== "removed")
    .reduce((total, paragraph) => total + paragraph.text.split(/\s+/).filter(Boolean).length, 0);
}

/** The top of the letter, as the template lays it out: name, contact lines, then the date. Added by code, never written by the model. */
export type LetterHead = { fullName: string; contact: string[]; date: string };

export function letterHead(profile: Profile, today: Date): LetterHead {
  const { email, phone, location, linkedIn } = profile.contact;
  const details = [phone, email, linkedIn].filter(Boolean).join(" | ");
  return {
    fullName: profile.fullName,
    contact: [location, details].filter((line): line is string => Boolean(line)),
    date: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" }).format(today),
  };
}

/** The approved changes and answers a letter rests on, as one string: if it changes, the letter needs a new look. */
export function letterBasis(changes: TailoringChange[], answers: GapAnswer[]): string {
  const approved = changes
    .filter((change) => change.status === "approved")
    .map((change) => `${change.id}:${change.after}`)
    .sort();
  const given = answers.map((answer) => `${answer.gapId}:${answer.hasExperience}:${answer.answer}`).sort();
  return JSON.stringify({ approved, given });
}

/** An approved letter whose basis has changed is no longer approved: it may claim something the CV no longer says. */
export function currentLetter(letter: LetterState | null, basis: string): LetterState | null {
  if (!letter?.approved || letter.basis === basis) return letter;
  return { ...letter, approved: false, stale: true };
}
