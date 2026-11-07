/**
 * The new wording a CV check fix suggests, so the page can offer to copy it (#335). The prompt puts new wording in
 * single quotes and the CV's own words in double quotes (prompts/cvcheck-review.md), so only single-quoted text
 * outside double quotes counts. Curly quotes (‘…’) count too, each kind closing only its own kind.
 *
 * A single quote is also an apostrophe ("don't", "employers' first question"), so the text is scanned: an opening
 * quote comes after the start, a space or punctuation and before a letter or digit; a closing quote comes after a
 * character and before the end, a space or punctuation. Each opening quote takes the FIRST closing quote after it.
 * When another closing quote follows in the same clause, before any punctuation or a new suggestion, it can't tell
 * which one closes the wording ("the Smiths' account'", "rock 'n' roll"), so it offers nothing for that one: the fix
 * is still on screen, and the page never offers wording it isn't sure of.
 *
 * Left out too: wording of one word ('Skills', 'colours'), which is quicker to type than to copy, and wording the
 * fix says not to write ("Don't add 'Power BI'", "Remove 'References available on request'").
 */
export function suggestedWordings(fix: string): string[] {
  const text = withoutDoubleQuoted(fix);
  const found: string[] = [];
  let from = 0;
  while (from < text.length) {
    const open = nextOpening(text, from);
    if (open === -1) break;
    const closer = text[open] === "‘" ? "’" : "'";
    const close = nextClosing(text, open + 1, closer);
    if (close === -1) {
      from = open + 1;
      continue;
    }
    const another = closingLaterInClause(text, close + 1, closer);
    if (another !== -1) {
      from = another + 1;
      continue;
    }
    // Cut from the fix itself, so double-quoted words inside the wording stay in it.
    const wording = fix.slice(open + 1, close).trim();
    if (wording.split(/\s+/).length >= 2 && !saysNotToWrite(fix.slice(0, open)) && !found.includes(wording)) {
      found.push(wording);
    }
    from = close + 1;
  }
  return found;
}

/** What may come just before an opening single quote. */
const BEFORE_OPENING = /[\s(\[“"/—–,:;…→]/;
/** What may come just after an opening single quote: the wording's first character. */
const OPENS_WORDING = /[\p{L}\p{N}(“"‘'£$€]/u;
/** What may come just after a closing single quote. */
const AFTER_CLOSING = /[\s.,;:!?)\]”"/—–…*»-]/;
/** Where a clause ends, for telling whether a later quote could still close the same wording. */
const CLAUSE_BREAK = /[.,;:!?)\]/—–…]/;

function isOpening(text: string, i: number): boolean {
  const char = text[i];
  if (char !== "'" && char !== "‘") return false;
  return (i === 0 || BEFORE_OPENING.test(text[i - 1])) && OPENS_WORDING.test(text[i + 1] ?? "");
}

function isClosing(text: string, k: number, closer: string): boolean {
  if (text[k] !== closer || !/\S/.test(text[k - 1] ?? "")) return false;
  const after = text[k + 1];
  return after === undefined || AFTER_CLOSING.test(after);
}

function nextOpening(text: string, from: number): number {
  for (let i = from; i < text.length; i++) if (isOpening(text, i)) return i;
  return -1;
}

function nextClosing(text: string, from: number, closer: string): number {
  for (let k = from; k < text.length; k++) if (isClosing(text, k, closer)) return k;
  return -1;
}

/** Another quote that could close the same wording, before the clause ends or a new suggestion starts, or -1. */
function closingLaterInClause(text: string, from: number, closer: string): number {
  for (let k = from; k < text.length; k++) {
    if (CLAUSE_BREAK.test(text[k]) || isOpening(text, k)) return -1;
    if (isClosing(text, k, closer)) return k;
  }
  return -1;
}

/** True when the words just before a quote say not to write it: "Don't add", "Remove", "instead of", "not". */
function saysNotToWrite(before: string): boolean {
  return /(?:\b(?:don['’]t|do not|never)\s+\w+|\b(?:avoid|remove|delete|drop|instead of|rather than|replace|not))\s*$/i.test(before);
}

/** The fix with the CV's own double-quoted words blanked out (same length), so quotes inside them don't count. */
function withoutDoubleQuoted(fix: string): string {
  return fix.replace(/“[^”]*”|"[^"]*"/g, (quoted) => " ".repeat(quoted.length));
}
