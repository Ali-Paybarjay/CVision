/**
 * The new wording a CV check fix suggests, so the page can offer to copy it (#335). The prompt puts new wording in
 * single quotes and the CV's own words in double quotes (prompts/cvcheck-review.md), so only single-quoted text
 * counts. An apostrophe inside the wording ("the team's rota") is not a closing quote, because a closing quote is
 * followed by the end, a space or punctuation. Curly quotes (‘…’) count too.
 *
 * Only wording of two words or more is offered: a single word, such as a heading ('Skills') or a UK spelling
 * ('colours'), is quicker to type than to copy.
 */
export function suggestedWordings(fix: string): string[] {
  const found: string[] = [];
  const patterns = [/(?<=^|[\s(“"])'(.+?)'(?=$|[\s.,;:!?)”"])/g, /‘(.+?)’(?=$|[\s.,;:!?)”"])/g];
  for (const pattern of patterns) {
    for (const match of fix.matchAll(pattern)) {
      const wording = match[1].trim();
      if (wording.split(/\s+/).length >= 2 && !found.includes(wording)) found.push(wording);
    }
  }
  return found;
}
