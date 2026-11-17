// How the user wants their professional summary to describe them (#16 of the Tailor v2 design). Used on the page and
// on the server, so it imports nothing that only runs on one of them.
import type { Profile } from "@/shared/contracts";

/** The longest description the user may type in their own words. */
export const MAX_OWN_WORDS = 60;

/** At most this many job titles from the CV to choose from, the latest first. */
const maxTitles = 3;

/**
 * How the summary describes the user: the way their summary does now, a job title from their CV, or their own words.
 * Never the job ad's title as a choice: a user for whom it is true types it themselves.
 */
export type DescribeAs = { kind: "summary" } | { kind: "title"; title: string } | { kind: "own"; words: string };

/** What the user can choose from: their summary's own description if they have a summary, and their job titles. */
export function summaryOptions(profile: Profile): { hasSummary: boolean; titles: string[] } {
  const titles: string[] = [];
  for (const job of profile.experience) {
    const title = job.title.trim();
    if (title && !titles.some((item) => item.toLowerCase() === title.toLowerCase())) titles.push(title);
  }
  return { hasSummary: profile.summary.trim() !== "", titles: titles.slice(0, maxTitles) };
}

/** The choice the page starts with: the user's own summary when there is one, else their latest job title. */
export function defaultDescribeAs(profile: Profile): DescribeAs {
  const { hasSummary, titles } = summaryOptions(profile);
  if (hasSummary) return { kind: "summary" };
  if (titles.length > 0) return { kind: "title", title: titles[0] };
  return { kind: "own", words: "" };
}

/** Whether the server may use this choice: a title from the CV, a summary that exists, or a short own description. */
export function isAllowedDescription(profile: Profile, describeAs: DescribeAs): boolean {
  const { hasSummary, titles } = summaryOptions(profile);
  if (describeAs.kind === "summary") return hasSummary;
  if (describeAs.kind === "title") return titles.includes(describeAs.title);
  const words = describeAs.words.trim();
  return words !== "" && words.length <= MAX_OWN_WORDS;
}
