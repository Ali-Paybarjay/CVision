import type { FetchPageFailure } from "@/shared/web/fetch-page";

// Reading a job ad from its link (#330). The server opens the page with fetchPublicPage (#278) and the ad's text goes
// into the ad box, where the user checks it before asking for the match: nothing reaches the AI unseen. Pure, so the
// page and the server action share the site list and the messages.

/** Why the ad couldn't be read from its link: the page's own reasons, plus two of ours. */
export type AdLinkFailure =
  | FetchPageFailure
  /** A site that never shows its ads to another website, so we don't try. */
  | "text-only-site"
  /** The page opened, but it is too short to hold a whole ad, such as a sign-in box or a robot check. */
  | "no-ad";

type JobSite = {
  /** The site's address. Its subdomains match too: "indeed.com" matches "uk.indeed.com". */
  host: string;
  /** The name people know it by, for messages and usage events. */
  name: string;
  /** The site never shows its ads to another website, so the page asks for the text at once. */
  textOnly?: true;
};

/**
 * Job sites that UK users bring links from, checked on live ads on 7 Nov 2026 with fetchPublicPage (#330), from a home
 * connection rather than Vercel. The first match wins, so a subdomain with its own rule comes before its site. The
 * event "jobs.link_read" names the site from this list rather than the address, which for a company's own careers page
 * would name the employer.
 */
const JOB_SITES: JobSite[] = [
  // LinkedIn showed its public ad pages, but refused the third request in a row, its search pages are not the ad,
  // and its terms forbid reading it automatically.
  { host: "linkedin.com", name: "LinkedIn", textOnly: true },
  { host: "lnkd.in", name: "LinkedIn", textOnly: true },
  // A bot check answers every page at once.
  { host: "indeed.com", name: "Indeed", textOnly: true },
  { host: "indeed.co.uk", name: "Indeed", textOnly: true },
  { host: "glassdoor.co.uk", name: "Glassdoor", textOnly: true },
  { host: "glassdoor.com", name: "Glassdoor", textOnly: true },
  { host: "cv-library.co.uk", name: "CV-Library", textOnly: true },
  // StepStone's sites never answer, so the user would wait the whole 10 seconds for nothing.
  { host: "totaljobs.com", name: "Totaljobs", textOnly: true },
  { host: "jobsite.co.uk", name: "Jobsite", textOnly: true },
  { host: "cwjobs.co.uk", name: "CWJobs", textOnly: true },
  { host: "caterer.com", name: "Caterer.com", textOnly: true },
  { host: "retailchoice.com", name: "Retail Choice", textOnly: true },
  { host: "milkround.com", name: "Milkround", textOnly: true },
  // A security check (a CAPTCHA) answers with 403, checked on 8 Nov 2026 (a pilot doctor's feedback): NHS and other
  // health jobs that don't use NHS Jobs are often on Trac.
  { host: "trac.jobs", name: "Trac", textOnly: true },
  // These answer with a page that isn't the ad: a "Quick Check Needed" box, or a "We're moving" page.
  { host: "civilservicejobs.service.gov.uk", name: "Civil Service Jobs", textOnly: true },
  { host: "app.welcometothejungle.com", name: "Welcome to the Jungle", textOnly: true },
  { host: "otta.com", name: "Otta", textOnly: true },
  // These gave the ad, alone or among the page's menus.
  { host: "reed.co.uk", name: "Reed" },
  { host: "jobs.nhs.uk", name: "NHS Jobs" },
  { host: "findajob.dwp.gov.uk", name: "Find a job" },
  { host: "jobs.ac.uk", name: "jobs.ac.uk" },
  { host: "tes.com", name: "Tes" },
  { host: "charityjob.co.uk", name: "CharityJob" },
  { host: "prospects.ac.uk", name: "Prospects" },
  { host: "adzuna.co.uk", name: "Adzuna" },
  { host: "hays.co.uk", name: "Hays" },
  { host: "michaelpage.co.uk", name: "Michael Page" },
  { host: "roberthalf.com", name: "Robert Half" },
  { host: "randstad.co.uk", name: "Randstad" },
  { host: "welcometothejungle.com", name: "Welcome to the Jungle" },
  { host: "myworkdayjobs.com", name: "Workday" },
  { host: "greenhouse.io", name: "Greenhouse" },
  { host: "lever.co", name: "Lever" },
  { host: "ashbyhq.com", name: "Ashby" },
  { host: "smartrecruiters.com", name: "SmartRecruiters" },
  { host: "teamtailor.com", name: "Teamtailor" },
  { host: "successfactors.com", name: "SuccessFactors" },
  { host: "successfactors.eu", name: "SuccessFactors" },
  // Pages built in the browser: the reader says so (no-text), and the user pastes the ad.
  { host: "workable.com", name: "Workable" },
  { host: "oraclecloud.com", name: "Oracle Recruiting" },
  { host: "taleo.net", name: "Taleo" },
];

/** The link's host, lower case. new URL rather than URL.parse, which phones on iOS 17 don't have. */
function hostOf(link: string): string | null {
  try {
    return new URL(link).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}

/** The job site a link belongs to, if it is one we know. */
export function jobSite(link: string): JobSite | null {
  const host = hostOf(link);
  if (!host) return null;
  return JOB_SITES.find((site) => host === site.host || host.endsWith(`.${site.host}`)) ?? null;
}

/** The site as people write it, such as "reed.co.uk", for the line that says where the ad came from. */
export function siteLabel(link: string): string {
  return hostOf(link)?.replace(/^www\./, "") ?? link;
}

/** Each reason, then what to do: the ad box is right below the message. */
const failureMessages: Record<Exclude<AdLinkFailure, "text-only-site">, string> = {
  "invalid-url": "We couldn’t open this link. Check that it’s the ad’s full address.",
  blocked: "This site doesn’t let other websites open its job ads, or it wants you to sign in.",
  "not-found": "There’s no ad at this link. The ad may have closed, or the link may be cut short.",
  "too-slow": "The page took too long to open.",
  "too-large": "The page is too large for us to read.",
  "not-a-page": "This link opens a file, such as a PDF, not a web page.",
  "no-text": "This page only shows its ad inside a web browser, so we can’t read it.",
  "no-ad": "We couldn’t find a whole job ad on this page.",
  failed: "We couldn’t open the page.",
};

/** What the page says when it can't read the ad from the link, and asks for the ad's text instead. */
export function adLinkFailureMessage(reason: AdLinkFailure, link: string): string {
  const site = jobSite(link);
  const why =
    reason === "text-only-site"
      ? `${site?.name ?? "This site"} doesn’t let other websites open its job ads.`
      : failureMessages[reason];
  const from = reason === "not-a-page" ? "the file" : "the page";
  return `${why} Copy the ad from ${from} and paste it below.`;
}

/** Why no page was opened at all: the day's reads from links are used up, or couldn't be counted (#391). */
export type LinkLimitReason = "limit" | "limit-error";

/** Then what to do, as for a link that can't be read: the ad box is right below the message. */
export const linkLimitMessages: Record<LinkLimitReason, string> = {
  limit: "You’ve reached today’s limit for getting ads from links. Copy the ad from the page and paste it below.",
  "limit-error": "We couldn’t open the link just now. Copy the ad from the page and paste it below.",
};

/**
 * Under the ad box, when an NHS ad may have left its criteria in a PDF (#400). Only the criteria: the whole PDF is often
 * longer than the box takes, and cutting it down would cost the very criteria (#420).
 */
export const personSpecHint =
  "NHS ads often keep the person specification in a PDF called Job description and person specification. Paste its essential and desirable criteria below the ad, not the whole PDF, so we can match them.";

/**
 * A line or table cell that is only a criteria heading, such as "Person specification" or "Essential criteria:".
 * The words alone are not enough: "Job description and person specification (PDF)" is the link to the PDF, and
 * "essential car user" is a criterion (#420).
 */
const CRITERIA_HEADING = /^(?:person specification|(?:essential|desirable)(?:\s+criteria)?)\s*(?::|$)/i;

/** A short line or table cell that names both kinds, such as "Criteria Essential Desirable How assessed" (#469). */
const CRITERIA_COLUMNS = /^(?=.*\bessential\b)(?=.*\bdesirable\b)(?:\S+\s+){0,7}\S+$/i;

/** Text that only points at a document the ad doesn't hold, such as "Please see the attached job description" (#469). */
const POINTS_ELSEWHERE = /\b(?:attached|separate|enclosed)\b.*\b(?:document|job description|person specification|pdf|jd)\b/i;

/**
 * An NHS employer, for an ad pasted without its link or with a link to another site, such as Reed. "NHS" alone is in
 * ads from firms that work with the NHS.
 */
const NHS_EMPLOYER = /\bnhs (?:foundation )?trust\b|\bagenda for change\b/i;

/**
 * Whether to show personSpecHint: the ad is from NHS Jobs or Trac (by its link, or an NHS employer's ad pasted
 * without one or from another site) and its text has no criteria. Trac often keeps the criteria only in the PDF.
 * A Band counts only beside "NHS", so Scottish and Welsh boards stay in but a charity's Band 5 doesn't (#469).
 */
export function needsPersonSpecHint(ad: string, link: string): boolean {
  if (ad.trim() === "" || hasCriteria(ad)) return false;
  const site = jobSite(link.trim())?.name;
  return site === "NHS Jobs" || site === "Trac" || NHS_EMPLOYER.test(ad) || (/\bband [1-9]/i.test(ad) && /\bnhs\b/i.test(ad));
}

/**
 * Whether the ad holds its criteria: it has a criteria heading, and what is under its headings is not only a pointer
 * to a document. NHS Jobs shows "Person Specification" and "Essential" even when all that follows is "Please see the
 * attached job description" (#469). Under a heading is the heading itself when it is such a pointer, else the text
 * after its colon, else the first line after it that is neither a heading nor a group's name, the line just above a
 * heading, such as "Qualifications" or "Additional Criteria". A heading with nothing under it still counts.
 */
function hasCriteria(ad: string): boolean {
  const pieces = ad
    .split(/[\n\t]/)
    .map((piece) => piece.trim())
    .filter(Boolean);
  const isHeading = pieces.map((piece) => CRITERIA_HEADING.test(piece) || CRITERIA_COLUMNS.test(piece));
  if (!isHeading.includes(true)) return false;

  const under = pieces.flatMap((piece, index) => {
    if (!isHeading[index]) return [];
    if (POINTS_ELSEWHERE.test(piece)) return [piece];
    const afterColon = piece.includes(":") ? piece.slice(piece.indexOf(":") + 1).trim() : "";
    if (afterColon) return [afterColon];
    const next = pieces.findIndex((_, later) => later > index && !isHeading[later] && !isHeading[later + 1]);
    return next === -1 ? [] : [pieces[next]];
  });
  return under.length === 0 || under.some((text) => !POINTS_ELSEWHERE.test(text));
}
