/**
 * The new wording a CV check fix suggests, so the page can offer to copy it (#335). The prompt puts new wording in
 * single quotes and the CV's own words in double quotes (prompts/cvcheck-review.md), so only single-quoted text
 * outside double quotes counts. Curly quotes (‘…’) count too.
 *
 * A single quote is also an apostrophe ("don't", "the Smiths' account"), so the text is scanned rather than matched
 * with one pattern: an opening quote follows the start, a space or punctuation and comes before a letter; a closing
 * quote comes after a letter and before the end, a space or punctuation. Each opening quote takes the last closing
 * quote before the next opening one, so an apostrophe inside the wording doesn't cut it short, and an em dash or a
 * slash after a quote still closes it.
 *
 * Only wording of two words or more is offered: a single word, such as a heading ('Skills') or a UK spelling
 * ('colours'), is quicker to type than to copy.
 */
export function suggestedWordings(fix: string): string[] {
  const text = withoutDoubleQuoted(fix);
  const openings: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (isQuote(text[i]) && text[i] !== "’" && (i === 0 || BEFORE_OPENING.test(text[i - 1])) && /\S/.test(text[i + 1] ?? "")) {
      openings.push(i);
    }
  }

  const found: string[] = [];
  openings.forEach((start, index) => {
    const end = index + 1 < openings.length ? openings[index + 1] : text.length;
    let close = -1;
    for (let k = start + 1; k < end; k++) {
      const after = text[k + 1];
      if ((text[k] === "'" || text[k] === "’") && /\S/.test(text[k - 1]) && (after === undefined || AFTER_CLOSING.test(after))) close = k;
    }
    if (close === -1) return;
    const wording = text.slice(start + 1, close).trim();
    if (wording.split(/\s+/).length >= 2 && !found.includes(wording)) found.push(wording);
  });
  return found;
}

/** What may come just before an opening single quote. */
const BEFORE_OPENING = /[\s(“"/—–,:;]/;
/** What may come just after a closing single quote. */
const AFTER_CLOSING = /[\s.,;:!?)”"/—–]/;

function isQuote(char: string): boolean {
  return char === "'" || char === "‘" || char === "’";
}

/** The fix with the CV's own double-quoted words blanked out (same length), so quotes inside them don't count. */
function withoutDoubleQuoted(fix: string): string {
  return fix.replace(/“[^”]*”|"[^"]*"/g, (quoted) => " ".repeat(quoted.length));
}
