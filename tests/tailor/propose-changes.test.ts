import { describe, expect, it } from "vitest";
import { proposeChanges, suggestFromCv, type GapAnswer, type Proposal } from "@/features/tailor";
import { ProposedChangeSchema } from "@/features/tailor/types";
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

describe("ProposedChangeSchema", () => {
  it("asks the model only for the fields it writes, never the ones Tailor or code fill", () => {
    expect(Object.keys(ProposedChangeSchema.shape).sort()).toEqual(
      ["after", "before", "evidence", "evidenceSource", "gapId", "section"],
    );
  });
});

describe("suggestFromCv fills the skills up to six (#191)", () => {
  const sara = personas.sara;
  const line = "Cleaned and joined weekly sales data from 120 stores using SQL and Python";
  const skill = (after: string) => ({ section: "skills" as const, before: null, after, evidence: line, evidenceSource: "cv" as const });
  const sample = { changes: [skill("Power BI"), skill("SQL"), skill("Python"), skill("SQL")], nextSteps: [] };

  it("suggests skills the CV shows elsewhere, only up to six skills in all, never twice and never one it does not show", async () => {
    const profile = { ...sara.profile, skills: ["Excel", "Tableau", "R", "Statistics", "Data cleaning"] };
    const result = await suggestFromCv({ profile, job: sara.jobs[0], match: sara.match, sample });
    expect(result.changes.map((change) => [change.section, change.before, change.after, change.status])).toEqual([["skills", null, "SQL", "proposed"]]);
  });

  it("suggests no new skill when the CV already lists six or more", async () => {
    const result = await suggestFromCv({ profile: sara.profile, job: sara.jobs[0], match: sara.match, sample });
    expect(result.changes).toEqual([]);
  });
});
