import { describe, expect, it } from "vitest";
import {
  askGapQuestions,
  enforceNothingInvented,
  proposeChanges,
  sampleAnswers,
  sampleProposals,
  unsupportedReason,
  type ProposedChange,
} from "@/features/tailor";
import { personas } from "@/shared/sample-data";
import { nothingInventedCases } from "./nothing-invented.cases";

const sara = personas.sara;
const saraSources = { profile: sara.profile, gaps: sara.match.gaps, answers: sampleAnswers.sara };

describe("gap questions", () => {
  it.each(Object.entries(personas))("asks %s one question per gap", async (_, { profile, jobs, match }) => {
    const questions = await askGapQuestions({ profile, job: jobs[0], match });
    expect(questions.map((item) => item.gapId)).toEqual(match.gaps.map((gap) => gap.id));
  });
});

describe("the sample proposals", () => {
  it.each(Object.entries(personas))("for %s pass Nothing invented", async (name, { profile, jobs, match }) => {
    const key = name as keyof typeof personas;
    const result = await proposeChanges({ profile, job: jobs[0], match, answers: sampleAnswers[key], sample: sampleProposals[key] });
    expect(result.removed).toEqual([]);
    expect(result.changes.length).toBeGreaterThan(0);
    expect(result.changes.every((change) => change.status === "proposed")).toBe(true);
  });
});

describe("Nothing invented check", () => {
  const supported: ProposedChange = sampleProposals.sara.changes[0];

  it("keeps a change quoted from the user's answer", () => {
    expect(unsupportedReason(supported, saraSources)).toBeNull();
  });

  it("removes a change whose evidence the user never said", () => {
    const change = { ...supported, evidence: "I presented to the board every quarter" };
    expect(unsupportedReason(change, saraSources)).toMatch(/not a quote/);
  });

  it("removes a change that claims CV evidence the CV does not have", () => {
    const change = { ...supported, evidenceSource: "cv" as const };
    expect(unsupportedReason(change, saraSources)).toMatch(/CV/);
  });

  it("removes a change for a gap the user has no experience of", () => {
    const change: ProposedChange = {
      gapId: "sara-gap-2",
      section: "skills",
      before: null,
      after: "Tableau",
      evidence: "I have only used Tableau",
      evidenceSource: "follow-up-answer",
    };
    expect(unsupportedReason(change, saraSources)).toMatch(/no experience/);
  });

  it("removes a skill the user said they do not have, even without a gap link", () => {
    const change: ProposedChange = {
      section: "experience",
      before: "Built Tableau dashboards for the regional sales team",
      after: "Built Tableau and Power BI dashboards for the regional sales team",
      evidence: "Built Tableau dashboards for the regional sales team",
      evidenceSource: "cv",
    };
    expect(unsupportedReason(change, saraSources)).toMatch(/power bi/);
  });

  it("removes a new skill that its evidence does not name", () => {
    const change = { ...sampleProposals.sara.changes[1], after: "Docker" };
    expect(unsupportedReason(change, saraSources)).toMatch(/not named/);
  });

  it("does not accept a one-word quote as evidence", () => {
    const change = { ...supported, evidence: "Monday" };
    expect(unsupportedReason(change, saraSources)).not.toBeNull();
  });

  it("keeps a faithful quote when the user's text has hidden characters the model never saw", () => {
    const answers = sampleAnswers.sara.map((answer) =>
      answer.gapId === supported.gapId
        ? { ...answer, answer: answer.answer.replace("regional managers", "regi\u00ADonal\u200B managers") }
        : answer,
    );
    const profile = { ...sara.profile, followUpAnswers: [] };
    expect(answers).not.toEqual(sampleAnswers.sara);
    expect(unsupportedReason(supported, { ...saraSources, profile, answers })).toBeNull();
  });

  it("splits changes into kept and removed", () => {
    const invented = { ...supported, evidence: "I led a team of ten analysts" };
    const { kept, removed } = enforceNothingInvented([supported, invented], saraSources);
    expect(kept).toEqual([supported]);
    expect(removed).toHaveLength(1);
  });
});

describe("the ten Nothing invented cases in mock mode", () => {
  it("has ten cases", () => {
    expect(nothingInventedCases).toHaveLength(10);
  });

  it.each(nothingInventedCases)("$name", async ({ persona, answers, forbidden, sample }) => {
    const { profile, jobs, match } = personas[persona];
    const result = await proposeChanges({ profile, job: jobs[0], match, answers, sample });
    expect(result.removed).toEqual([]);
    for (const change of result.changes) {
      for (const word of forbidden) {
        expect(change.after.toLowerCase().includes(word) && !(change.before ?? "").toLowerCase().includes(word)).toBe(false);
      }
    }
  });
});
