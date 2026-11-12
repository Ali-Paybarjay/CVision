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
import { readFileSync } from "node:fs";
import { scopeWordAdded, scopeWords, wholeWorkClaimed } from "@/features/tailor/nothing-invented";
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

  it("removes a line that makes the work sound wider or more frequent than the user said (Tailor v2 review)", () => {
    const wider = { ...supported, after: `${supported.after} at each site` };
    expect(unsupportedReason(wider, saraSources)).toContain('"each"');
    const weekly = { ...supported, after: `Explained the dashboards to the sales team weekly` };
    expect(unsupportedReason(weekly, saraSources)).toContain('"weekly"');
  });

  it("keeps such a word when the user's own answer to the gap or the line it rewrites says it", () => {
    const gitAnswer = sampleAnswers.sara.find((answer) => answer.answer.includes("every"))!;
    // The evidence quotes the answer without "every", so only the answer can supply it.
    const fromAnswer: ProposedChange = { ...supported, gapId: gitAnswer.gapId, evidence: "I used Git and GitHub", after: "Committed code to Git after every analysis step" };
    expect(scopeWordAdded(fromAnswer, saraSources)).toBeNull();
    expect(scopeWordAdded({ ...fromAnswer, gapId: "sara-gap-2" }, saraSources)).toBe("every");
    const fromLine = { ...supported, before: "Checked all reports before release", after: "Checked all sales reports before release" };
    expect(scopeWordAdded(fromLine, saraSources)).toBeNull();
    // Whole words only: "overall" and "everyone" are not "all" and "every".
    expect(scopeWordAdded({ ...supported, after: "Improved overall accuracy for everyone on the team" }, saraSources)).toBeNull();
  });

  it("does not count the ad's words that a tap answer repeats as the user's (#487 review)", () => {
    const gap = { ...sara.match.gaps[0], requirement: "Carry out weekly safety checks on all equipment" };
    const tap = { gapId: gap.id, question: "Have you done this?", answer: "Yes, I have done this at work: Carry out weekly safety checks on all equipment.", hasExperience: true };
    const sources = { ...saraSources, gaps: [gap], answers: [tap] };
    const change: ProposedChange = { ...supported, gapId: gap.id, before: null, evidence: tap.answer, after: "Carried out weekly safety checks on all equipment" };
    expect(scopeWordAdded(change, sources)).toBe("weekly");
    const quote = { ...change, evidence: "weekly safety checks on all equipment" };
    expect(scopeWordAdded(quote, sources)).toBe("weekly");
    // Their own words after the tap still count.
    const own = { ...tap, answer: `${tap.answer} I did them every week at Fenwick.` };
    expect(scopeWordAdded({ ...change, after: "Carried out safety checks every week" }, { ...sources, answers: [own] })).toBeNull();
  });

  it("does not count a word the user denied", () => {
    const daniel = personas.daniel;
    const answer = { gapId: daniel.match.gaps[0].id, question: "Q?", answer: "My managers each run a team. I don't manage all 45 staff directly.", hasExperience: true };
    const sources = { profile: daniel.profile, gaps: daniel.match.gaps, answers: [answer] };
    const change: ProposedChange = { ...supported, gapId: answer.gapId, before: null, evidence: "My managers each run a team", after: "Directly managed all 45 staff" };
    expect(scopeWordAdded(change, sources)).toBe("all");
  });

  it("removes a line that claims the whole of work the user did only in part", () => {
    const answer = { gapId: "sara-gap-1", question: "Q?", answer: "Partly. I made the slides, and my team lead presented them.", hasExperience: true };
    const sources = { ...saraSources, answers: [answer] };
    const change: ProposedChange = { ...supported, gapId: "sara-gap-1", before: null, evidence: "I made the slides", after: "Led the sales dashboard presentations" };
    expect(unsupportedReason(change, sources)).toContain('"led"');
    expect(wholeWorkClaimed({ ...change, after: "Made the slides for the sales dashboard presentations" }, sources)).toBeNull();
    // A line that already starts with the verb keeps it.
    expect(wholeWorkClaimed({ ...change, before: "Led the weekly sales call", after: "Led the weekly sales call, with slides I made" }, sources)).toBeNull();
  });

  it("lists the same words in both prompts as in the check", () => {
    for (const file of ["prompts/tailor-propose.md", "prompts/tailor-suggest.md"]) {
      const prompt = readFileSync(file, "utf8");
      for (const word of scopeWords) expect(prompt, `${file} lacks "${word}"`).toContain(`"${word}"`);
    }
  });

  it("splits changes into kept and removed", () => {
    const invented = { ...supported, evidence: "I led a team of ten analysts" };
    const { kept, removed } = enforceNothingInvented([supported, invented], saraSources);
    expect(kept).toEqual([supported]);
    expect(removed).toHaveLength(1);
  });
});

describe("the twelve Nothing invented cases in mock mode", () => {
  it("has twelve cases", () => {
    expect(nothingInventedCases).toHaveLength(12);
  });

  it.each(nothingInventedCases)("$name", async ({ persona, answers, forbidden, notFirstWords, sample }) => {
    const { profile, jobs, match } = personas[persona];
    const result = await proposeChanges({ profile, job: jobs[0], match, answers, sample });
    expect(result.removed).toEqual([]);
    for (const change of result.changes) {
      for (const word of forbidden) {
        expect(change.after.toLowerCase().includes(word) && !(change.before ?? "").toLowerCase().includes(word)).toBe(false);
      }
      expect(notFirstWords).not.toContain(change.after.toLowerCase().trim().split(/\s+/)[0]);
    }
  });
});
