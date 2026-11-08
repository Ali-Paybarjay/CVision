import { describe, expect, it } from "vitest";
import type { CvCheckResult } from "@/shared/contracts";
import { resultAsText, resultFileName } from "./result-text";

// The CV check's result as a text file the user keeps (#375): a pilot lost it on leaving the page.

const result: CvCheckResult = {
  readiness: "nearly-ready",
  score: 72,
  summary: "Nearly ready. Add a short skills list first.",
  issues: [
    {
      id: "issue-1",
      title: "Duties, not results",
      explanation: "Your lines list duties, so a UK employer can't see what changed because of you.",
      fix: `Change "Responsible for the rota" to 'Planned the weekly staff rota' if that is what you did.`,
      severity: "high",
    },
    {
      id: "issue-2",
      title: "No skills section",
      explanation: "A recruiter has to dig through the job entry to see what you can do.",
      fix: "Add a short 'Skills' section with four to six items you have used.",
      severity: "low",
    },
  ],
};

const checkedOn = new Date("2026-11-08T21:30:00Z");

describe("resultAsText", () => {
  it("keeps the verdict, the score, the summary and every issue with its fix, in the page's order", () => {
    const text = resultAsText(result, checkedOn);

    expect(text).toContain("CVision: Free 2-minute CV check");
    expect(text).toContain("Checked on 8 November 2026");
    expect(text).toContain("Nearly ready: 72 out of 100");
    expect(text).toContain("Nearly ready. Add a short skills list first.");
    expect(text).toContain("1. Duties, not results (Fix first)");
    expect(text).toContain(`How to fix it: Change "Responsible for the rota" to 'Planned the weekly staff rota' if that is what you did.`);
    expect(text).toContain("2. No skills section (Polish)");
    expect(text.indexOf("Duties, not results")).toBeLessThan(text.indexOf("No skills section"));
  });

  it("leaves out the fix list when there is nothing to fix", () => {
    const text = resultAsText({ ...result, readiness: "ready", score: 88, issues: [] }, checkedOn);

    expect(text).toContain("Ready for UK employers: 88 out of 100");
    expect(text).not.toContain("What to fix");
  });

  it("names the file after the day in the UK, so a later check doesn't replace it", () => {
    expect(resultFileName(checkedOn)).toBe("cvision-cv-check-2026-11-08.txt");
    // 00:30 in London on 1 July is still 30 June in UTC.
    expect(resultFileName(new Date("2026-06-30T23:30:00Z"))).toBe("cvision-cv-check-2026-07-01.txt");
  });
});
