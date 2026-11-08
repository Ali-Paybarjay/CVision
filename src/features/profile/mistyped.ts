// Lines that look mistyped: a key held down or tapped in a pattern, letters typed with another keyboard layout still
// on, or a stray backslash. Such a line still counts as evidence, so the match quotes it word for word and Tailor builds
// on it. The review step points at it before the user approves; it never blocks, because only the user knows what
// they meant (You approve everything). Simple rules, no model, so it costs nothing and gives the same answer every time.

/** Signs that a line was mistyped. Each was checked against every line of the four sample personas. */
const SIGNS = [
  // A chunk of two to four letters three times in a row: "xsxsxs", "شسزشسزشسز".
  /(\p{L}{2,4})\1{2}/u,
  // One letter five times in a row: "aaaaa".
  /(\p{L})\1{4}/u,
  // A backslash before a letter: "preparation\xsax". CV lines have no use for one.
  /\\\p{L}/u,
];

/** Letters from a keyboard left in Persian, Arabic, Russian or Hebrew, inside a line written in English. */
const OTHER_KEYBOARD = /[\p{Script=Arabic}\p{Script=Cyrillic}\p{Script=Hebrew}]+/u;
const LATIN = /\p{Script=Latin}/u;

/** How many characters of a long line to show, and how many of them come before the part that looks wrong. */
const EXCERPT_LENGTH = 80;
const EXCERPT_BEFORE = 25;

/** Where the first sign is in a line, or -1 if it looks fine. */
function firstSign(line: string): number {
  const found = SIGNS.map((sign) => line.search(sign));
  if (LATIN.test(line)) found.push(line.search(OTHER_KEYBOARD));
  const at = found.filter((index) => index >= 0);
  return at.length > 0 ? Math.min(...at) : -1;
}

/** The part of a long line around `at`, cut at spaces, with "…" where it was cut. */
function excerpt(line: string, at: number): string {
  if (line.length <= EXCERPT_LENGTH) return line;
  let start = Math.max(0, at - EXCERPT_BEFORE);
  let end = Math.min(line.length, start + EXCERPT_LENGTH);
  start = Math.max(0, end - EXCERPT_LENGTH);
  // Cut at a space, but never past the part that looks wrong.
  const spaceAfterStart = line.indexOf(" ", start);
  if (start > 0 && spaceAfterStart >= 0 && spaceAfterStart < at) start = spaceAfterStart + 1;
  const spaceBeforeEnd = line.lastIndexOf(" ", end);
  if (end < line.length && spaceBeforeEnd > at) end = spaceBeforeEnd;
  return `${start > 0 ? "…" : ""}${line.slice(start, end).trim()}${end < line.length ? "…" : ""}`;
}

/** The lines of a box that look mistyped, one per line of the box, shortened around the part that looks wrong. */
export function mistypedLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .flatMap((line) => {
      const at = firstSign(line);
      return at >= 0 ? [excerpt(line, at)] : [];
    });
}
