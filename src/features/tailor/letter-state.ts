// The cover letter on the Tailor page, and when an approved letter has to be read again.
// Pure code, so the page and the tests share it.
import type { TailoringChange } from "@/shared/contracts";
import type { GapAnswer } from "./types";

/**
 * The cover letter as the user last left it; only an approved letter is used for export.
 * `basis` is what the letter was approved against (see letterBasis); `stale` means the CV changed since.
 */
export type LetterState = { text: string; approved: boolean; basis?: string; stale?: boolean; error?: string };

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
