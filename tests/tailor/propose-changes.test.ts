import { describe, expect, it } from "vitest";
import { unsupportedReason } from "@/features/tailor/nothing-invented";
import { proposeChanges, suggestFromCv, type GapAnswer, type Proposal } from "@/features/tailor";
import { ProposedChangeSchema } from "@/features/tailor/types";
import type { Profile } from "@/shared/contracts";
import { personas } from "@/shared/sample-data";
import { clinicalFixtures } from "./clinical-fixture";

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

describe("suggestFromCv offers the six main skills, never tools (#191)", () => {
  const sara = personas.sara;
  const line = "Cleaned and joined weekly sales data from 120 stores using SQL and Python";
  const skill = (after: string, evidence = line) => ({ section: "skills" as const, before: null, after, evidence, evidenceSource: "cv" as const });

  it("keeps a main skill a CV line shows, once, and drops tools and made-up lines", async () => {
    const sample = { changes: [skill("Attention to detail"), skill("Attention to detail"), skill("SQL"), skill("Leadership", "Led a global team of 200")], nextSteps: [] };
    const result = await suggestFromCv({ profile: sara.profile, job: sara.jobs[0], match: sara.match, sample });
    expect(result.changes.map((change) => [change.section, change.before, change.after, change.status])).toEqual([["skills", null, "Attention to detail", "proposed"]]);
  });

  it("offers only as many as fit in six, counting the listed main skills the ad asks for", async () => {
    const profile = { ...sara.profile, skills: ["Communication", "Leadership", "Teamwork", "Planning", "Creativity", "SQL"] };
    const sample = { changes: [skill("Attention to detail"), skill("Problem solving")], nextSteps: [] };
    const job = { ...sara.jobs[0], requirements: { essential: ["Communication", "Leadership", "Teamwork", "Planning", "Creativity"], desirable: [] } };
    const result = await suggestFromCv({ profile, job, match: sara.match, sample });
    expect(result.changes.map((change) => change.after)).toEqual(["Attention to detail"]);
  });

  it("does not let listed main skills this ad never asks for use up the six", async () => {
    const profile = { ...sara.profile, skills: ["Negotiation", "Creativity", "Coaching", "Mentoring", "Networking", "Initiative"] };
    const sample = { changes: [skill("Attention to detail"), skill("Problem solving")], nextSteps: [] };
    const result = await suggestFromCv({ profile, job: sara.jobs[0], match: sara.match, sample });
    expect(result.changes.map((change) => change.after)).toEqual(["Attention to detail", "Problem solving"]);
  });

  it("does not find a tool inside another word: \"R\" is not in \"stores\"", () => {
    const change = skill("R");
    expect(unsupportedReason(change, { profile: sara.profile, gaps: [], answers: [] })).toBe("The new skill is not named in the evidence.");
    expect(unsupportedReason(skill("SQL"), { profile: sara.profile, gaps: [], answers: [] })).toBeNull();
  });

  it("does not accept the skills list itself as proof of a main skill", async () => {
    const profile = { ...sara.profile, skills: ["SQL", "Project communication"] };
    const sample = { changes: [skill("Communication", "Project communication")], nextSteps: [] };
    expect((await suggestFromCv({ profile, job: sara.jobs[0], match: sara.match, sample })).changes).toEqual([]);
  });
});

describe("suggestFromCv keeps the job's conditions off a CV that does not show them (#526)", () => {
  const sara = personas.sara;
  const licence = "Full UK driving licence";
  const job = { ...sara.jobs[0], requirements: { ...sara.jobs[0].requirements, essential: [...sara.jobs[0].requirements.essential, licence] } };
  const line = "Built Tableau dashboards for the regional sales team";
  const rewrite = (after: string) => ({ section: "experience" as const, before: line, after, evidence: line, evidenceSource: "cv" as const });
  const withLicence = rewrite(`${line}, with a full UK driving licence.`);
  const plain = rewrite("Built Tableau dashboards that the regional sales team used");

  it.each([{ conditions: undefined }, { conditions: [{ requirement: licence, kind: "credential" as const }] }])("removes a rewrite that adds a driving licence the CV does not show (%j)", async ({ conditions }) => {
    const result = await suggestFromCv({ profile: sara.profile, job: { ...job, conditions }, match: sara.match, sample: { changes: [withLicence, plain], nextSteps: [] } });
    expect(result.changes.map((change) => change.after)).toEqual([plain.after]);
    expect(result.removed?.map((item) => item.reason)).toEqual(['It adds "Full UK driving licence", which the CV does not show.']);
  });

  it("keeps it when a CV line shows the licence", async () => {
    const profile = { ...sara.profile, skills: [...sara.profile.skills, licence] };
    const result = await suggestFromCv({ profile, job, match: sara.match, sample: { changes: [withLicence], nextSteps: [] } });
    expect(result.changes.map((change) => change.after)).toEqual([withLicence.after]);
  });
});

describe("the job's conditions after the second #526 review", () => {
  const sara = personas.sara;
  const leah = clinicalFixtures;
  type Section = "summary" | "experience" | "skills";
  const withCondition = <T extends { requirements: { essential: string[] } }>(job: T, requirement: string): T => ({
    ...job,
    conditions: undefined,
    requirements: { ...job.requirements, essential: [...job.requirements.essential, requirement] },
  });
  const rewrite = (before: string, after: string, section: Section = "experience") => ({ section, before, after, evidence: before, evidenceSource: "cv" as const });
  const tableau = "Built Tableau dashboards for the regional sales team";
  const cleaned = "Cleaned and joined weekly sales data from 120 stores using SQL and Python";
  const careFor = "Care for up to eight acutely unwell patients on a 32-bed acute medical unit";
  const saraSuggests = (changes: ReturnType<typeof rewrite>[], requirement: string, saraProfile: Profile = sara.profile) =>
    suggestFromCv({ profile: saraProfile, job: withCondition(sara.jobs[0], requirement), match: sara.match, sample: { changes, nextSteps: [] } });
  const withDuty = (duty: string): Profile => ({
    ...sara.profile,
    experience: sara.profile.experience.map((job, index) => (index === 1 ? { ...job, duties: [...job.duties, duty] } : job)),
  });

  it("keeps a rewrite with full, fully, successfully or carefully when the ad asks for a Full, clean UK driving licence", async () => {
    const nurse = await suggestFromCv({
      profile: leah.profile,
      job: withCondition(leah.job, "Full, clean UK driving licence"),
      match: leah.match,
      sample: { changes: [rewrite(careFor, `Fully care for ${careFor.slice(9)}`), rewrite(careFor, `Carried out full patient assessments: care for ${careFor.slice(9)}`)], nextSteps: [] },
    });
    expect(nurse.removed).toEqual([]);
    const analyst = await saraSuggests([rewrite(cleaned, `Successfully cleaned ${cleaned.slice(8)}`), rewrite(cleaned, `Carefully cleaned ${cleaned.slice(8)}`)], "Full, clean UK driving licence");
    expect(analyst.removed).toEqual([]);
  });

  it("removes a full, clean UK driving licence even when the CV says full elsewhere", async () => {
    const result = await saraSuggests([rewrite(tableau, `${tableau}, with a full, clean UK driving licence`)], "Full, clean UK driving licence", withDuty("Worked full-time while studying."));
    expect(result.changes).toEqual([]);
    expect(result.removed?.map((item) => item.reason)).toEqual(['It adds "Full, clean UK driving licence", which the CV does not show.']);
  });

  it.each([
    ["Full UK driving licence", `${tableau}, holding a full clean UK driving licence`],
    ["Full UK driving licence", `${cleaned}, as a UK driving licence holder`],
    ["Enhanced DBS check", `${tableau}, with a current enhanced DBS`],
    ["Right to work in the UK", `${tableau}; eligible to work in the UK without sponsorship`],
  ])("removes a rewrite that claims %s in other words: %s", async (requirement, after) => {
    const result = await saraSuggests([rewrite(after.startsWith(tableau) ? tableau : cleaned, after)], requirement);
    expect(result.changes).toEqual([]);
    expect(result.removed).toHaveLength(1);
  });

  it.each([
    ["Full UK driving licence", "Working towards a full UK driving licence", `${tableau}, with a full UK driving licence`],
    ["Enhanced DBS check", "Enhanced DBS check applied for", `${tableau}, with an enhanced DBS check`],
    ["Right to work in the UK", "Right to work in the UK: Skilled Worker visa sponsorship required", `${tableau}, with the right to work in the UK`],
  ])("does not count a CV line that says %s is not held yet: %s", async (requirement, skill, after) => {
    const result = await saraSuggests([rewrite(tableau, after)], requirement, { ...sara.profile, skills: [...sara.profile.skills, skill] });
    expect(result.changes).toEqual([]);
  });

  it.each([
    ["Full UK driving licence", "Full clean UK driving licence", `${sara.profile.summary}, with a full UK driving licence.`],
    ["Enhanced DBS check", "Enhanced DBS (2024)", `${sara.profile.summary}, with an enhanced DBS check.`],
  ])("keeps a rewrite that claims %s when the CV shows it in other words: %s", async (requirement, skill, after) => {
    const result = await saraSuggests([rewrite(sara.profile.summary, after, "summary")], requirement, { ...sara.profile, skills: [...sara.profile.skills, skill] });
    expect(result.changes.map((change) => change.after)).toEqual([after]);
  });

  it("keeps night shift work in a rewrite when the CV says night shifts", async () => {
    const shifts = "Worked 12-hour day and night shifts on a 28-bed ward";
    const profile = { ...leah.profile, experience: leah.profile.experience.map((job, index) => (index === 1 ? { ...job, duties: [...job.duties, shifts] } : job)) };
    const after = "Worked 12-hour day and night shift work on a 28-bed ward";
    const result = await suggestFromCv({ profile, job: withCondition(leah.job, "Shift work, including nights, weekends and bank holidays"), match: leah.match, sample: { changes: [rewrite(shifts, after)], nextSteps: [] } });
    expect(result.changes.map((change) => change.after)).toEqual([after]);
  });

  describe("in proposeChanges, for a change written from an answer", () => {
    const job = withCondition(sara.jobs[0], "Full UK driving licence");
    const answerChange = (answer: string) => ({
      gapId: "sara-gap-3",
      section: "experience" as const,
      before: tableau,
      after: `${tableau}, with a full UK driving licence`,
      evidence: answer,
      evidenceSource: "follow-up-answer" as const,
    });
    const propose = (answer: string) =>
      proposeChanges({
        profile: sara.profile,
        job,
        match: { ...sara.match, gaps: [gap("sara-gap-3")] },
        answers: [{ ...gitAnswer, answer }],
        sample: { changes: [answerChange(answer)], nextSteps: [] },
      });

    it("removes a driving licence that neither the CV nor the answer shows", async () => {
      const result = await propose(gitAnswer.answer);
      expect(result.changes).toEqual([]);
      expect(result.removed.map((item) => item.reason)).toEqual(['It adds "Full UK driving licence", which the CV does not show.']);
    });

    it("keeps it when the user's own yes says they drive with a full UK licence", async () => {
      const result = await propose("I drive to clients with my full UK licence and used Git for my dissertation code.");
      expect(result.removed).toEqual([]);
      expect(result.changes).toHaveLength(1);
    });
  });
});
