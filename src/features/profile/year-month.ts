// A month and year as the profile keeps them, YYYY-MM, and the two parts the review page's Month and Year menus
// edit (#186). While the user has chosen only one part, the draft keeps it as "YYYY-" or "-MM", so a half-made
// choice is never lost. Only a whole YYYY-MM passes the checks, so nothing else is ever saved.

/** The oldest year the Year menus offer. */
export const EARLIEST_YEAR = 1960;

export type YearMonthParts = { year: string; month: string };

const WHOLE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The year and month in a draft date, each "" when not chosen. Anything unreadable gives two empty parts. */
export function splitYearMonth(value: string): YearMonthParts {
  const match = /^(\d{4})?-(0[1-9]|1[0-2])?$/.exec(value.trim());
  return match ? { year: match[1] ?? "", month: match[2] ?? "" } : { year: "", month: "" };
}

/** The draft date for two parts: YYYY-MM, "YYYY-" or "-MM" while one is missing, and "" when neither is chosen. */
export function joinYearMonth({ year, month }: YearMonthParts): string {
  return year || month ? `${year}-${month}` : "";
}

/** What is wrong with a draft date: nothing chosen, one part missing, or unreadable. Null for a whole YYYY-MM. */
export type YearMonthProblem = "missing" | "month" | "year" | "unreadable";

export function yearMonthProblem(value: string): YearMonthProblem | null {
  const text = value.trim();
  if (text === "") return "missing";
  if (WHOLE.test(text)) return null;
  if (/^\d{4}-$/.test(text)) return "month";
  if (/^-(0[1-9]|1[0-2])$/.test(text)) return "year";
  return "unreadable";
}

/**
 * The years a menu offers, newest first: from `latest` down to EARLIEST_YEAR. A chosen year outside that range,
 * such as a date read from a CV, is added in its place, so the menu always shows what the profile says.
 */
export function yearChoices(latest: number, chosen = ""): string[] {
  const years: number[] = [];
  for (let year = latest; year >= EARLIEST_YEAR; year--) years.push(year);
  const kept = /^\d{4}$/.test(chosen) ? Number(chosen) : null;
  if (kept !== null && !years.includes(kept)) years.push(kept);
  return years.sort((a, b) => b - a).map(String);
}
