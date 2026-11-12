import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { FinalCheck } from "@/app/tailor/final-check";
import { findBrandProblems } from "@/features/tailor/brand-check";
import { finalCheck, type FinalCheckId } from "@/features/tailor/final-check";
import { buildTailoredCv, type CvEntry, type TailoredCv } from "@/features/tailor/tailored-cv";
import { personas } from "@/shared/sample-data";

const line = (text: string) => ({ text, tailored: false });
const role = (title: string, lines: string[]): CvEntry => ({ title, company: "Fenwick Chemicals", dates: "Jun 2019 – Present", lines: lines.map(line) });

function cvWith(parts: Partial<TailoredCv>): TailoredCv {
  return { ...buildTailoredCv(personas.sara.profile, []), projects: [], ...parts };
}

const found = (cv: TailoredCv, id: FinalCheckId) => finalCheck(cv).find((item) => item.id === id)!.found;
const render = (cv: TailoredCv) => renderToStaticMarkup(createElement(FinalCheck, { cv, onReview: () => {} }));

describe("the final check (#489)", () => {
  it("passes a clean CV on every rule", () => {
    const cv = cvWith({ summary: line("Process engineer with ten years of plant design."), experience: [role("Process Engineer", ["Reviewed P&IDs and prepared equipment data sheets"])] });
    expect(finalCheck(cv).every((item) => item.found.length === 0)).toBe(true);
  });

  it("passes Sara's sample CV as the app builds it", () => {
    expect(finalCheck(buildTailoredCv(personas.sara.profile, [])).filter((item) => item.found.length > 0)).toEqual([]);
  });

  it("finds I, my and me, but not words, numerals or abbreviations that only contain them", () => {
    const cv = cvWith({
      summary: line("I am a process engineer."),
      experience: [
        role("Engineer", [
          "Led my team of four",
          "Improved maintenance times, i.e. downtime",
          "Ran Phase I trials of a new inhaler",
          "Maintained I&C loops and PLC I/O cards",
          "Designed I-beam supports",
          "Mentored new starters",
        ]),
      ],
    });
    expect(found(cv, "first-person")).toEqual(["I am a process engineer.", "Led my team of four"]);
  });

  it("lists a line that breaks a rule once, even when it is under two roles", () => {
    const cv = cvWith({ experience: [role("Engineer", ["I ran tests"]), role("Researcher", ["I ran tests"])] });
    expect(found(cv, "first-person")).toEqual(["I ran tests"]);
  });

  it("finds lines that say what the job was", () => {
    const cv = cvWith({ experience: [role("Engineer", ["Responsible for P&ID review", "Worked on HAZOP studies", "Reviewed P&IDs"])] });
    expect(found(cv, "duty-lines")).toEqual(["Responsible for P&ID review", "Worked on HAZOP studies"]);
  });

  it("finds a line that appears twice, once, and never a blank one", () => {
    const cv = cvWith({ experience: [role("Engineer", ["Ran permeation tests", "", " "]), role("Researcher", ["Ran permeation tests.", ""])] });
    expect(found(cv, "repeats")).toEqual(["Ran permeation tests"]);
  });

  it("finds US spelling with its UK form", () => {
    const cv = cvWith({ summary: line("Engineer who optimized plant color schemes."), experience: [] });
    expect(found(cv, "us-spelling")).toEqual(["optimized → optimised", "color → colour"]);
  });

  it("shows a tick for each rule passed, and the lines to fix for each one broken", () => {
    const html = render(cvWith({ experience: [role("Engineer", ["Worked on HAZOP studies"])], summary: null }));
    expect(html).toContain("No “I”, “my” or “me”");
    expect(html).toContain("These lines say what the job was, not what you did:");
    expect(html).toContain("“Worked on HAZOP studies”");
    expect(html).toContain("You can still download it now.");
    expect(html).toContain("Back to your changes");
    // Leaving for Profile would lose the cover letter and the answers, which only the Tailor page holds.
    expect(html).not.toContain('href="/profile"');
  });

  it("says nothing in American spelling and no banned words", () => {
    const html = render(cvWith({ experience: [role("Engineer", ["I worked on tests", "I worked on tests"])], summary: null }));
    const own = html.replace(/<[^>]+>/g, " ").replace(/“[^”]*”/g, " ");
    expect(findBrandProblems(own)).toEqual([]);
  });
});
