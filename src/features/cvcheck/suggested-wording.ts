/**
 * The new wording a CV check fix suggests, so the page can offer to copy it (#335). The prompt puts new wording in
 * single quotes and the CV's own words in double quotes (prompts/cvcheck-review.md).
 *
 * The fix is prose the model wrote, and a single quote is also an apostrophe ("4 years' experience", "the '90s",
 * "don't"), so no reading of it is right every time. The rule here is the other way round: offer wording only when it
 * can't be misread, and offer nothing otherwise. The fix stays on screen either way, so a missed offer costs a few
 * seconds of typing, while wrong text in the Copy box could end up in someone's CV. Wording is offered only when:
 * - its opening quote comes straight after a word that introduces new wording: "to", "write", "use", "add", "try",
 *   "with", "for", "as", "say", "e.g." or "example" (so not the CV's own words after "Change", "Replace" or "Swap");
 * - nothing in the same sentence before it says not to write it ("don't", "never", "avoid", "remove", "not"…);
 * - the next quote mark of any kind closes it, and is followed by the end, a space or punctuation, so wording with an
 *   apostrophe inside ("the team's rota") is never cut short: it isn't offered;
 * - no other quote mark follows in the rest of the sentence, so a possessive after it can't be the real end;
 * - it is two words or more ('Skills' and 'colours' are quicker to type than to copy), and not a whole sentence.
 */
export function suggestedWordings(fix: string): string[] {
  const found: string[] = [];
  for (const sentence of sentences(fix)) {
    const { text, start: offset } = sentence;
    for (let i = 0; i < text.length; i++) {
      if (text[i] !== "'" && text[i] !== "‘") continue;
      const before = text.slice(0, i);
      if (!INTRODUCES_WORDING.test(before) || SAYS_NOT_TO.test(before) || !/\S/.test(text[i + 1] ?? "")) continue;

      const close = nextQuote(text, i + 1);
      if (close === -1 || !/\S/.test(text[close - 1]) || !AFTER_CLOSING.test(text[close + 1] ?? " ")) continue;
      if (nextQuote(text, close + 1) !== -1) break; // another quote later in this sentence: can't be sure where it ends

      const wording = fix.slice(offset + i + 1, offset + close).trim();
      if (wording.split(/\s+/).length >= 2 && !/[.!?]\s/.test(wording) && !found.includes(wording)) found.push(wording);
      i = close;
    }
  }
  return found;
}

/** The last word before an opening quote, when it introduces new wording. */
const INTRODUCES_WORDING = /(?:^|[\s(“"])(?:to|write|use|add|try|with|for|as|say|e·g·|example)[:,]?\s*$/i;
/** Anything earlier in the sentence that says not to write what follows. */
const SAYS_NOT_TO = /\b(?:don['’]t|do not|never|avoid|remove|delete|drop|cut|take out|leave out|no need|not)\b/i;
/** What may come just after a closing quote. */
const AFTER_CLOSING = /[\s.,;:!?)\]”"…—–/]/;

function nextQuote(text: string, from: number): number {
  for (let k = from; k < text.length; k++) if ("'‘’".includes(text[k])) return k;
  return -1;
}

/**
 * The fix cut into sentences, each with where it starts in the fix. A sentence ends at . ! ? or ; before a space or
 * the end, but not in "e.g." or "i.e.", so "Avoid phrases, e.g. 'team player'" stays one sentence.
 */
function sentences(fix: string): { text: string; start: number }[] {
  const guarded = fix.replace(/\b(?:e\.g|i\.e)\./gi, (abbreviation) => abbreviation.replace(/\./g, "·"));
  const result: { text: string; start: number }[] = [];
  let start = 0;
  for (let k = 0; k < guarded.length; k++) {
    if (/[.!?;]/.test(guarded[k]) && (k + 1 === guarded.length || /\s/.test(guarded[k + 1]))) {
      result.push({ text: guarded.slice(start, k + 1), start });
      start = k + 1;
    }
  }
  if (start < guarded.length) result.push({ text: guarded.slice(start), start });
  return result;
}
