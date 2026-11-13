// The summary card's server side (#16): how the user can ask to be described, and the summary the model writes for it.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Proposal, ProposedChange } from "@/features/tailor";
import type { Profile } from "@/shared/contracts";

// Keeps the prompt each feature sends, and answers with the sample as mock mode does.
const sent = vi.hoisted(() => new Map<string, string>());
vi.mock("@/shared/ai", async (original) => ({
  ...(await original<typeof import("@/shared/ai")>()),
  askModel: vi.fn(async (options: { feature: string; prompt: string; sample: unknown }) => {
    sent.set(options.feature, options.prompt);
    return options.sample;
  }),
}));

const { adTitleAdded, defaultDescribeAs, isAllowedDescription, suggestFromCv, summaryOptions, writeSummary } = await import("@/features/tailor");
const { sampleCvSuggestions } = await import("@/features/tailor");
const { personas } = await import("@/shared/sample-data");

const { profile, jobs, match } = personas.reza;
const job = jobs[0];
const evidence = "Coordinated the move to a new school timetable for 1,100 students and 80 staff, delivered on time";
const summaryOf = (after: string, extra: Partial<ProposedChange> = {}): Proposal => ({
  changes: [{ section: "summary", before: "not quite the user's summary", after, evidence, evidenceSource: "cv", ...extra }],
  nextSteps: [],
});
const asTitle = { kind: "title", title: "Maths Teacher" } as const;

describe("how the summary can describe the user", () => {
  it("offers their summary first, then their job titles once each, the latest first", () => {
    const withRepeat: Profile = { ...profile, experience: [...profile.experience, { ...profile.experience[0], title: " maths teacher " }] };
    expect(summaryOptions(withRepeat)).toEqual({ hasSummary: true, titles: ["Maths Teacher and Head of Year 9", "Maths Teacher"] });
    expect(defaultDescribeAs(profile)).toEqual({ kind: "summary" });
  });

  it("starts with the latest job title when there is no summary", () => {
    const noSummary = { ...profile, summary: "  " };
    expect(summaryOptions(noSummary).hasSummary).toBe(false);
    expect(defaultDescribeAs(noSummary)).toEqual({ kind: "title", title: "Maths Teacher and Head of Year 9" });
  });

  it("lets the server use only a title from the CV, a summary that exists, or short own words", () => {
    expect(isAllowedDescription(profile, asTitle)).toBe(true);
    expect(isAllowedDescription(profile, { kind: "title", title: job.title })).toBe(false);
    expect(isAllowedDescription({ ...profile, summary: "" }, { kind: "summary" })).toBe(false);
    expect(isAllowedDescription(profile, { kind: "own", words: "Project coordinator" })).toBe(true);
    expect(isAllowedDescription(profile, { kind: "own", words: "   " })).toBe(false);
    expect(isAllowedDescription(profile, { kind: "own", words: "x".repeat(61) })).toBe(false);
  });
});

describe("the summary the model writes", () => {
  beforeEach(() => sent.clear());

  it("tells the model how to describe the user, and never to use the ad's title", async () => {
    await writeSummary({ profile, job, match, describeAs: asTitle, sample: summaryOf("Maths teacher with nine years of planning.") });
    const prompt = sent.get("tailor-summary");
    expect(prompt).toContain('Describe the person as: "Maths Teacher", a job title from their CV.');
    expect(prompt).toContain(`The job ad's title is "${job.title}". Never use it`);
    expect(prompt).toContain("a duty in the ad is not something the person has done");
  });

  it("always replaces the user's whole summary, and waits for their decision", async () => {
    const { change } = await writeSummary({ profile, job, match, describeAs: asTitle, sample: summaryOf("Maths teacher with nine years of planning.") });
    expect(change).toMatchObject({ section: "summary", before: profile.summary, status: "proposed", jobId: job.id, evidence });
    expect(change?.gapId).toBeUndefined();
  });

  it("adds a summary when the user has none", async () => {
    const { change } = await writeSummary({ profile: { ...profile, summary: "" }, job, match, describeAs: asTitle, sample: summaryOf("Maths teacher with nine years of planning.") });
    expect(change?.before).toBeNull();
  });

  it("removes a summary that gives the user the ad's title, unless they typed it themselves", async () => {
    const sample = summaryOf(`${job.title} with nine years of planning and leading people.`);
    const refused = await writeSummary({ profile, job, match, describeAs: asTitle, sample });
    expect(refused.change).toBeNull();
    expect(refused.removed[0].reason).toContain(job.title);

    const own = await writeSummary({ profile, job, match, describeAs: { kind: "own", words: job.title }, sample });
    expect(own.change?.after).toContain(job.title);
  });

  it("finds the ad's title in any case, but not when the CV already has it", () => {
    const after = `Experienced ${job.title.toUpperCase()} and maths teacher.`;
    expect(adTitleAdded(after, job, profile, asTitle)).toBe(job.title);
    const held: Profile = { ...profile, experience: [{ ...profile.experience[0], title: job.title }, ...profile.experience.slice(1)] };
    expect(adTitleAdded(after, job, held, asTitle)).toBeNull();
  });

  it("removes a summary that quotes no CV line, and offers nothing when it is the same as the user's", async () => {
    const unquoted = await writeSummary({ profile, job, match, describeAs: asTitle, sample: summaryOf("Maths teacher.", { evidence: "Led a team of 40" }) });
    expect(unquoted.change).toBeNull();
    expect(unquoted.removed).toHaveLength(1);

    const same = await writeSummary({ profile, job, match, describeAs: asTitle, sample: summaryOf(` ${profile.summary} `) });
    expect(same).toEqual({ change: null, removed: [] });
  });

  it("keeps the mock summaries for the sample jobs", async () => {
    for (const name of ["sara", "reza", "emma", "daniel"] as const) {
      const persona = personas[name];
      const sample = { ...sampleCvSuggestions[name], changes: sampleCvSuggestions[name].changes.filter((item) => item.section === "summary") };
      const { change, removed } = await writeSummary({ ...persona, job: persona.jobs[0], describeAs: { kind: "summary" }, sample });
      expect(removed, name).toEqual([]);
      expect(change, name).not.toBeNull();
    }
  });
});

describe("the suggestions from the CV (#16)", () => {
  it("leave the summary to the summary card", async () => {
    const result = await suggestFromCv({ profile, job, match, sample: sampleCvSuggestions.reza });
    expect(result.changes.some((change) => change.section === "summary")).toBe(false);
    expect(sent.get("tailor-suggest")).toContain("Do not suggest a summary");
    expect(sent.get("tailor-suggest")).not.toContain(JSON.stringify(profile.summary));
  });
});
