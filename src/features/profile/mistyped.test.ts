import { describe, expect, it } from "vitest";
import { personas } from "@/shared/sample-data";
import { mistypedLines } from "./mistyped";

describe("mistypedLines", () => {
  it("points at a line with a backslash and letters typed with the Persian keyboard still on", () => {
    const line =
      "Automated a weekly stock report, cutting preparation\\xsaxasxsax ژشسزشسزشسزشسز time from 4 hours to 30 minutes";

    const [found, ...rest] = mistypedLines(`Built dashboards in Power BI\n${line}`);

    expect(rest).toEqual([]);
    // A long line is shortened around the part that looks wrong, so the user sees it at once.
    expect(found).toContain("preparation\\xsaxasxsax ژشسزشسزشسزشسز");
    expect(found.length).toBeLessThanOrEqual(82);
    expect(found).toMatch(/^…/);
  });

  it.each([
    ["a chunk typed over and over", "Managed sdfsdfsdf stock"],
    ["one key held down", "Led a team of fiveeeee"],
    ["Persian letters inside English", "Ran the till شسیب every day"],
    ["Russian letters inside English", "Ran the till фыва every day"],
    ["a stray backslash", "Trained new staff\\n on safety"],
  ])("points at %s", (_kind, line) => {
    expect(mistypedLines(line)).toEqual([line]);
  });

  it.each([
    "Wrote reports in C#, SQL and Node.js for the P&L owner",
    "Achieved a 2:1 in BSc Accounting; Level III award in Bookkeeping",
    "Shipped Microsoft 365 training to 1,200 staff (Mississippi office)",
    "Committee member at Sheffield Hallam Students’ Union",
    "Spoke Farsi with customers every day",
    "",
  ])("leaves a line that is right alone: %j", (line) => {
    expect(mistypedLines(line)).toEqual([]);
  });

  it("leaves every line of the sample personas alone", () => {
    for (const { profile } of Object.values(personas)) {
      const boxes = [
        profile.summary,
        ...profile.experience.flatMap((job) => [...job.duties, ...job.achievements]),
        ...(profile.volunteering ?? []).flatMap((role) => role.details),
        ...(profile.projects ?? []).flatMap((project) => project.details),
      ];
      for (const box of boxes) expect(mistypedLines(box), box).toEqual([]);
    }
  });
});
