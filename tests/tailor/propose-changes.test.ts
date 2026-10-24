import { describe, expect, it } from "vitest";
import { proposeChanges, type GapAnswer, type Proposal } from "@/features/tailor";
import { personas } from "@/shared/sample-data";

const { profile, jobs, match } = personas.sara;
const gap = (id: string) => match.gaps.find((item) => item.id === id)!;

const gitAnswer: GapAnswer = {
  gapId: "sara-gap-3",
  question: "Have you used Git?",
  answer: "I used Git and GitHub for my MSc dissertation code and committed after every analysis step.",
  hasExperience: true,
};
const noPowerBi: GapAnswer = { gapId: "sara-gap-2", question: "Have you used Power BI?", answer: "No, I have only used Tableau.", hasExperience: false };

// A suggestion for the Git gap that slips in Power BI, which Sara said no to in another gap.
const sample: Proposal = {
  changes: [
    {
      gapId: "sara-gap-3",
      section: "experience",
      before: "Built Tableau dashboards for the regional sales team",
      after: "Built Tableau and Power BI dashboards for the regional sales team, versioned in Git",
      evidence: "I used Git and GitHub for my MSc dissertation code",
      evidenceSource: "follow-up-answer",
    },
  ],
  nextSteps: [],
};

describe("proposeChanges", () => {
  const input = { profile, job: jobs[0], match: { ...match, gaps: [gap("sara-gap-3")] }, answers: [gitAnswer], sample };

  it("uses the user's answers to other gaps, so a no there still blocks that skill here", async () => {
    const result = await proposeChanges({ ...input, context: { gaps: [gap("sara-gap-2")], answers: [noPowerBi] } });
    expect(result.changes).toEqual([]);
    expect(result.removed[0].reason).toContain("power bi");
  });

  it("without the other answers, cannot know about that no", async () => {
    expect((await proposeChanges(input)).changes).toHaveLength(1);
  });
});
