import { describe, expect, it } from "vitest";
import { askGapQuestions, gapQuestionsPrompt, skillGaps } from "@/features/tailor";
import type { Gap } from "@/shared/contracts";
import { personas } from "@/shared/sample-data";

const gap = (id: string, requirement: string): Gap => ({ ...personas.sara.match.gaps[0], id, requirement });

describe("the gap questions ask only about skills and experience", () => {
  it.each([
    "Full UK driving licence",
    "Full clean driving licence",
    "Right to work in the UK",
    "Willing to travel",
    "Willingness to travel within the UK and internationally",
    "Visa sponsorship is not available",
    "Available for weekend shifts",
    "Available to work weekends",
    "Weekend and night shift cover when needed",
    "DBS check",
    "Enhanced DBS check",
  ])("never asks about %s", (requirement) => {
    expect(skillGaps([gap("a", requirement)])).toEqual([]);
  });

  it.each([
    "Power BI",
    "Stakeholder communication",
    "Managing a budget",
    "Gas Safe licence",
    // A licence to practise is a professional registration, not a driving licence (#401).
    "Full licence to practise",
    "Full GMC registration with a licence to practise",
    // Real skills and experience that only contain a word from a condition (#246).
    "Experience designing high-availability systems",
    "Experience processing payroll and salary changes",
    "Experience carrying out right to work checks",
    "Processing DBS checks for new starters",
    "Experience leading shift teams",
    "Knowledge of UK visa and immigration casework",
    "Improvisation skills",
    "Experience managing staff relocation",
    "Experience securing corporate sponsorship",
    "Experience improving on-shelf availability",
    "Knowledge of salary benchmarking",
  ])("still asks about %s", (requirement) => {
    expect(skillGaps([gap("a", requirement)])).toHaveLength(1);
  });

  it("writes no question for a gap it leaves out", async () => {
    const { profile, jobs, match } = personas.sara;
    const questions = await askGapQuestions({ profile, job: jobs[0], match: { ...match, gaps: [gap("a", "Power BI"), gap("b", "Full driving licence")] } });
    expect(questions.map((item) => item.gapId)).toEqual(["a"]);
  });
});

describe("the gap questions prompt", () => {
  it("finds the role first and keeps the ad's own words (#401)", async () => {
    const { profile, jobs, match } = personas.sara;
    const prompt = await gapQuestionsPrompt({ profile, job: jobs[0], gaps: match.gaps });
    expect(prompt).toContain("## The role first");
    expect(prompt).toContain("use the ad's own words");
    expect(prompt).not.toContain("no jargon");
    expect(prompt.indexOf("## The role first")).toBeLessThan(prompt.indexOf("## How to ask"));
  });

  it("gives the model the whole ad, not just the requirements", async () => {
    const { profile, jobs, match } = personas.sara;
    const prompt = await gapQuestionsPrompt({ profile, job: jobs[0], gaps: match.gaps });
    expect(prompt).toContain(JSON.stringify(jobs[0].description));
  });
});
