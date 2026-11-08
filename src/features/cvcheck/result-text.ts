import { brand } from "@/shared/brand";
import type { CvCheckResult, CvIssue } from "@/shared/contracts";

/**
 * The result of a CV check as a plain text file the user keeps (#375). A pilot (8 November) lost the result when
 * they left the page. The file is made in the browser from what is on screen: nothing is stored on our side.
 */

export const readinessLabels: Record<CvCheckResult["readiness"], string> = {
  ready: "Ready for UK employers",
  "nearly-ready": "Nearly ready",
  "not-ready": "Not ready yet",
};

export const severityLabels: Record<CvIssue["severity"], string> = {
  high: "Fix first",
  medium: "Worth fixing",
  low: "Polish",
};

const checkedDate = (date: Date) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" }).format(date);

/** The file's text: the verdict, the score, the summary, then each issue with how to fix it, in the page's order. */
export function resultAsText(result: CvCheckResult, checkedOn: Date): string {
  const lines = [
    `${brand.name}: ${brand.cta.cvCheck}`,
    `Checked on ${checkedDate(checkedOn)}`,
    "",
    `${readinessLabels[result.readiness]}: ${result.score} out of 100`,
    "",
    result.summary,
  ];
  if (result.issues.length > 0) {
    lines.push("", "What to fix");
    result.issues.forEach((issue, index) => {
      lines.push("", `${index + 1}. ${issue.title} (${severityLabels[issue.severity]})`, issue.explanation, `How to fix it: ${issue.fix}`);
    });
  }
  lines.push("", "This check reads the text of your CV for UK employers in general, not for one job.");
  return `${lines.join("\n")}\n`;
}

/** For example cvision-cv-check-2026-11-08.txt, so a second check on another day doesn't replace the first. */
export function resultFileName(checkedOn: Date): string {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(checkedOn);
  return `${brand.name.toLowerCase()}-cv-check-${day}.txt`;
}
