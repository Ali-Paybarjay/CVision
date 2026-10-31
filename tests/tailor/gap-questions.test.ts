import { describe, expect, it } from "vitest";
import { askGapQuestions, skillGaps } from "@/features/tailor";
import type { Gap } from "@/shared/contracts";
import { personas } from "@/shared/sample-data";

const gap = (id: string, requirement: string): Gap => ({ ...personas.sara.match.gaps[0], id, requirement });

describe("the gap questions ask only about skills and experience", () => {
  it.each(["Full UK driving licence", "Right to work in the UK", "Willing to travel", "Available for weekend shifts", "DBS check"])("never asks about %s", (requirement) => {
    expect(skillGaps([gap("a", requirement)])).toEqual([]);
  });

  it.each(["Power BI", "Stakeholder communication", "Managing a budget", "Gas Safe licence"])("still asks about %s", (requirement) => {
    expect(skillGaps([gap("a", requirement)])).toHaveLength(1);
  });

  it("writes no question for a gap it leaves out", async () => {
    const { profile, jobs, match } = personas.sara;
    const questions = await askGapQuestions({ profile, job: jobs[0], match: { ...match, gaps: [gap("a", "Power BI"), gap("b", "Full driving licence")] } });
    expect(questions.map((item) => item.gapId)).toEqual(["a"]);
  });
});
