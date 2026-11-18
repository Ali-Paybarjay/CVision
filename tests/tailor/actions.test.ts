import { beforeEach, describe, expect, it, vi } from "vitest";
import { answerGap, decideChange, suggestCvChanges } from "@/features/tailor/actions";
import type { TailoringChange } from "@/shared/contracts";

const { getCurrentUser, createSupabaseServerClient, track } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  track: vi.fn(),
}));
vi.mock("@/features/account/current-user", () => ({ getCurrentUser }));
vi.mock("@/shared/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("@/shared/analytics/track", () => ({ track }));
vi.mock("@/shared/ai/anonymous-key", () => ({ getAnonymousKey: async () => ({ anonymousKey: "visitor" }) }));
vi.mock("next/server", () => ({ after: (task: () => Promise<void>) => task() }));

beforeEach(() => {
  vi.clearAllMocks();
  createSupabaseServerClient.mockResolvedValue(null);
  getCurrentUser.mockResolvedValue(null);
});

describe("answerGap", () => {
  it("suggests a change from a real answer, waiting for the user's approval", async () => {
    const result = await answerGap({
      jobId: "sara-job-1",
      gapId: "sara-gap-1",
      answer:
        "Every Monday I walked the regional managers through the dashboard on a call and wrote a one-page summary in plain English with the three things that changed that week.",
      hasExperience: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({ jobId: "sara-job-1", gapId: "sara-gap-1", status: "proposed" });
  });

  it("adds nothing when the user has not done it, and offers a next step", async () => {
    const result = await answerGap({ jobId: "sara-job-1", gapId: "sara-gap-3", answer: "", hasExperience: false });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changes).toEqual([]);
    expect(result.nextSteps.length).toBeGreaterThan(0);
  });

  it("drops a suggestion whose evidence the user did not say, and keeps only what they did say", async () => {
    // The sample suggestion quotes "I used Git and GitHub…", which this answer does not say.
    const result = await answerGap({ jobId: "sara-job-1", gapId: "sara-gap-3", answer: "I know some version control.", hasExperience: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.removed).toBe(1);
    expect(result.changes.map((change) => [change.section, change.after, change.evidence])).toEqual([
      ["skills", "Git", "Yes, I have done this at work: Git. I know some version control."],
    ]);
  });

  it.each(["3+ years of Python experience", "Experience managing a team", "First-class degree in Statistics", "Strong SQL"])(
    "does not put %s on the CV from a plain tap: the tap does not confirm all of it",
    async (requirement) => {
      const { personas } = await import("@/shared/sample-data");
      const original = personas.sara.match.gaps[1].requirement;
      personas.sara.match.gaps[1].requirement = requirement;
      const result = await answerGap({ jobId: "sara-job-1", gapId: "sara-gap-2", answer: "", hasExperience: true, where: "study" });
      personas.sara.match.gaps[1].requirement = original;
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.changes.filter((change) => change.after === requirement)).toEqual([]);
    },
  );

  it("takes the option the user tapped as their answer, and any detail after it", async () => {
    const chosen = "I built Power BI dashboards at work";
    const result = await answerGap({ jobId: "sara-job-1", gapId: "sara-gap-2", answer: "For the sales team.", hasExperience: true, chosen });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answer).toBe(`${chosen}. For the sales team.`);
  });

  it("needs only a tap: a plain yes to one tool adds it as a skill, quoting the user's answer (#191)", async () => {
    const result = await answerGap({ jobId: "sara-job-1", gapId: "sara-gap-2", answer: "", hasExperience: true, where: "study" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answer).toBe("Yes, I have done this in study or on my own: Power BI.");
    expect(result.changes).toMatchObject([{ section: "skills", before: null, after: "Power BI", status: "proposed" }]);
    expect(result.nextSteps).toEqual([]);
    expect(result.hint).toBeNull();
  });

  it("a no never adds anything, whatever detail comes with it", async () => {
    const result = await answerGap({ jobId: "sara-job-1", gapId: "sara-gap-2", answer: "Power BI", hasExperience: false });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changes).toEqual([]);
    expect(result.hint).toBeNull();
  });

  describe("a no in the user's own words counts as the No button (#245)", () => {
    it.each([
      "No",
      "No, I have never used Power BI",
      "No, I don't have advanced Excel",
      "I don't have a CSCS card yet",
      "Not yet. I am still studying for a BSc in Computer Science",
      "I'm not using Power BI yet.",
      "Not used Power BI yet.",
      "I'm not NMC registered yet, but I qualify in March.",
      "I'm not a Power BI user, but I'd like to learn it.",
      // #526 review: after "but" or "however" only something they did is a yes.
      "I'm not certified, but I can learn.",
      "I'm not trained in it, but I could learn quickly.",
      "I'm not NMC registered, but I have applied.",
      "I'm not a Power BI user, but my team is.",
      "I am not familiar with Jira, however we used Trello.",
      "I'm not a Power BI user, but I've seen it used.",
      "I'm not trained in it, but I need it for this job.",
    ])(
      "%s adds nothing and shows a next step",
      async (typed) => {
        const result = await answerGap({ jobId: "sara-job-1", gapId: "sara-gap-2", answer: "", hasExperience: true, chosen: typed, typed: true });
        expect(result).toMatchObject({ ok: true, hasExperience: false, answer: typed, changes: [], hint: null });
        if (result.ok) expect(result.nextSteps.length).toBeGreaterThan(0);
      },
    );

    it.each([
      "I used Power BI at work.",
      "No problem, I used Power BI for three years.",
      "I don't just use Tableau, Power BI too.",
      "No-code Power BI reports for the sales team.",
      "I'm not sure, but I used Power BI on placement.",
      "I'm not just a Power BI user, I built the reports.",
      // #526: what they did after "I'm not …, but" or "however" is a yes.
      "I'm not a manager, but I supervised three new starters.",
      "I am not a team leader. However, I trained four new starters.",
    ])(
      "%s stays a yes, but its words are for the model to read and never become the skill by themselves",
      async (typed) => {
        const result = await answerGap({ jobId: "sara-job-1", gapId: "sara-gap-2", answer: "", hasExperience: true, chosen: typed, typed: true });
        expect(result).toMatchObject({ ok: true, hasExperience: true, nextSteps: [] });
        if (result.ok) expect(result.changes.filter((change) => change.after === "Power BI")).toEqual([]);
      },
    );
  });

  describe("after \"I'm not …, but\", only a doing verb is a yes, and never for a credential or the requirement itself (#526)", () => {
    const answerFor = async (requirement: string, typed: string) => {
      const { personas } = await import("@/shared/sample-data");
      const original = personas.sara.match.gaps[1].requirement;
      personas.sara.match.gaps[1].requirement = requirement;
      try {
        return await answerGap({ jobId: "sara-job-1", gapId: "sara-gap-2", answer: "", hasExperience: true, chosen: typed, typed: true });
      } finally {
        personas.sara.match.gaps[1].requirement = original;
      }
    };
    const nmc = "Registered Nurse (Adult) with current NMC registration";
    const coordinating = "Experience coordinating a ward or unit shift in the absence of the nurse in charge";
    const supervising = "Experience of supervising and teaching students and junior staff";

    it.each([
      [nmc, "I'm not NMC registered, but I worked as a staff nurse in India for six years."],
      [nmc, "I am not registered with the NMC, however I qualified as a nurse in Nigeria in 2015."],
      [nmc, "I'm not on the NMC register, but I passed the CBT in June."],
      [nmc, "I'm not NMC registered, but I qualified as a nurse in India in 2018."],
      [nmc, "I'm not on the NMC register, but I passed my OSCE in May."],
      [nmc, "I'm not NMC registered, but I passed the OSCE"],
      [nmc, "I'm not a registered nurse, but I completed my nursing degree in 2022"],
      [nmc, "I'm not a registered nurse, but I worked as a senior carer."],
      ["HCPC registered physiotherapist", "I'm not HCPC registered, but I completed my BSc Physiotherapy in July."],
      // A licence or a DBS check is a condition, never a question (#497), so these ask about the work it is for.
      ["Experience in a care home setting", "I'm not DBS checked, but I volunteered at a care home for a year."],
      ["Experience visiting customers across the region", "I'm not a UK driver, but I held a licence in Iran for ten years."],
      ["Power BI", "I'm not a Power BI user, but I used Tableau."],
      ["Power BI", "I'm not familiar with Power BI, but I built dashboards in Tableau."],
      ["Jira", "I'm not familiar with Jira, but I used Trello for my coursework."],
      ["Phlebotomy", "I'm not trained in phlebotomy, but I watched the nurses do it."],
      ["Phlebotomy", "I'm not trained in phlebotomy, but I watched colleagues do it"],
      ["Phlebotomy", "I'm not trained, but I booked the course for January"],
      ["Venepuncture", "I'm not trained in venepuncture, but I observed it on placement"],
      ["CSCS card", "I'm not CSCS carded, but I passed the health and safety test."],
      ["SIA door supervisor licence", "I'm not SIA licensed, but I worked as a door supervisor in Spain."],
      ["Experience with SystmOne", "I'm not experienced with SystmOne, but I used EMIS every shift."],
      ["Experience with SystmOne", "I'm not experienced with SystmOne, but I watched a training video"],
      ["NVQ Level 3 in Health and Social Care", "I'm not qualified, but I started the NVQ Level 3 last month"],
      ["Care Certificate", "I'm not a qualified HCA, but I signed up for the Care Certificate"],
      ["Experience managing a team", "I'm not a manager, but I asked to shadow one"],
      ["Counterbalance forklift licence", "I'm not a forklift driver, but I asked my manager for training"],
      // A Band is a claim of its own, so the yes would count as support for it.
      [coordinating, "I'm not a Band 6, but I've acted as nurse in charge on nights."],
      [coordinating, "I'm not a Band 6 yet, but I've regularly acted as nurse in charge on nights"],
    ])("to %s, %s stays a no", async (requirement, typed) => {
      const result = await answerFor(requirement, typed);
      expect(result).toMatchObject({ ok: true, hasExperience: false, changes: [], hint: null });
      if (result.ok) expect(result.nextSteps.length).toBeGreaterThan(0);
    });

    it.each([
      [supervising, "I'm not a manager; however, I have supervised three new starters"],
      [supervising, "I am not a team leader; however I trained four new HCAs"],
      [supervising, "I'm not a manager, but I supervise two HCAs on every shift"],
      [supervising, "I'm not a manager but I do supervise new starters"],
      [supervising, "I'm not a manager, but in my last job I supervised three new starters"],
      ["Power BI", "I'm not an expert, but I use Power BI every week for ward reports"],
      [coordinating, "I'm not a team leader, but I lead the night shift twice a week"],
      [coordinating, "I'm not the ward manager, but I regularly run the shift as nurse in charge"],
      ["Experience managing a team", "I'm not a manager, but I supervised three new starters."],
    ])("to %s, %s is a yes", async (requirement, typed) => {
      expect(await answerFor(requirement, typed)).toMatchObject({ ok: true, hasExperience: true, nextSteps: [] });
    });

    it("keeps Power BI off the CV after a no that names Tableau instead", async () => {
      const result = await answerFor("Power BI", "I'm not a Power BI user, but I used Tableau.");
      expect(result).toMatchObject({ ok: true, hasExperience: false, changes: [], hint: null });
    });
  });

  describe("a tap on a ready answer (#245)", () => {
    it.each(["Advanced Excel", "Fluent Welsh", "Expert SQL", "BSc in Computer Science", "Chartered accountant", "CSCS card"])(
      "does not put %s on the CV: a tap does not confirm the level or the qualification",
      async (requirement) => {
        const { personas } = await import("@/shared/sample-data");
        const original = personas.sara.match.gaps[1].requirement;
        personas.sara.match.gaps[1].requirement = requirement;
        const result = await answerGap({ jobId: "sara-job-1", gapId: "sara-gap-2", answer: "", hasExperience: true, chosen: `I used ${requirement} at work.` });
        personas.sara.match.gaps[1].requirement = original;
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.changes.filter((change) => change.after === requirement)).toEqual([]);
      },
    );

    it("still puts one plain tool on the CV", async () => {
      const result = await answerGap({ jobId: "sara-job-1", gapId: "sara-gap-3", answer: "", hasExperience: true, chosen: "I used Git at work." });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.changes.map((change) => change.after)).toEqual(["Git"]);
    });
  });

  it("refuses a gap that is not in the job's match", async () => {
    // With sample data an unknown job id falls back to Sara's first job, as in Shayan's my-data (#48).
    expect((await answerGap({ jobId: "unknown-job", gapId: "reza-gap-1", answer: "Yes", hasExperience: true })).ok).toBe(false);
    expect((await answerGap({ jobId: "sara-job-1", gapId: "made-up", answer: "Yes", hasExperience: true })).ok).toBe(false);
  });

  it("in live mode, asks a visitor to sign in before calling the model", async () => {
    vi.stubEnv("AI_MODE", "live");
    try {
      const result = await answerGap({ jobId: "sara-job-1", gapId: "sara-gap-1", answer: "I ran a weekly call.", hasExperience: true });
      expect(result).toEqual({ ok: false, message: "Sign in to get suggestions for your CV." });
    } finally {
      vi.unstubAllEnvs();
    }
  });

});

describe("suggestCvChanges", () => {
  it("suggests changes from the CV alone, each quoting a CV line and waiting for approval (#191)", async () => {
    const result = await suggestCvChanges("sara-job-1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changes.length).toBeGreaterThan(0);
    for (const change of result.changes) {
      expect(change).toMatchObject({ evidenceSource: "cv", status: "proposed", jobId: "sara-job-1" });
      expect(change.gapId).toBeUndefined();
    }
  });

  it("in live mode, asks a visitor to sign in before calling the model", async () => {
    vi.stubEnv("AI_MODE", "live");
    try {
      expect(await suggestCvChanges("sara-job-1")).toEqual({ ok: false, message: "Sign in to get suggestions for your CV." });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

const jobId = "0b6f2d3e-6a51-4c1e-9d6e-2f6c1a7b9e10";
const change: TailoringChange = {
  id: "5d1c2b3a-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  jobId,
  gapId: "gap-1",
  section: "skills",
  before: null,
  after: "Git and GitHub",
  evidence: "I used Git and GitHub for my MSc dissertation code",
  evidenceSource: "follow-up-answer",
  status: "approved",
};

function fakeSupabase(jobs: string[]) {
  const upsert = vi.fn(async () => ({ error: null }));
  return {
    upsert,
    client: {
      from(table: string) {
        if (table === "tailoring_changes") return { upsert };
        let id: unknown;
        const query = {
          select: () => query,
          eq: (_: string, value: unknown) => ((id = value), query),
          maybeSingle: async () => ({ data: jobs.includes(id as string) ? { id } : null, error: null }),
        };
        return query;
      },
    },
  };
}

describe("decideChange", () => {
  it("saves an approved change in tailoring_changes for the signed-in user", async () => {
    const fake = fakeSupabase([jobId]);
    createSupabaseServerClient.mockResolvedValue(fake.client);
    getCurrentUser.mockResolvedValue({ id: "user-1", email: null });

    expect(await decideChange(change)).toEqual({ saved: true });
    expect(fake.upsert).toHaveBeenCalledWith(expect.objectContaining({ id: change.id, job_id: jobId, data: change }));
  });

  it("records the decision without any CV text", async () => {
    await decideChange({ ...change, status: "rejected" });
    expect(track).toHaveBeenCalledWith("tailor.change_rejected", { section: "skills", evidenceSource: "follow-up-answer" }, { anonymousKey: "visitor" });
    expect(JSON.stringify(track.mock.calls)).not.toContain("Git and GitHub");
  });

  it("does not save a change for a job in another account", async () => {
    const fake = fakeSupabase([]);
    createSupabaseServerClient.mockResolvedValue(fake.client);
    getCurrentUser.mockResolvedValue({ id: "user-1", email: null });

    expect(await decideChange(change)).toMatchObject({ saved: false, reason: "job-not-found" });
    expect(fake.upsert).not.toHaveBeenCalled();
  });

  it("explains why a sample job is not saved", async () => {
    createSupabaseServerClient.mockResolvedValue(fakeSupabase([]).client);
    getCurrentUser.mockResolvedValue({ id: "user-1", email: null });
    expect(await decideChange({ ...change, jobId: "sara-job-1" })).toMatchObject({ saved: false, reason: "sample-job" });
  });

  it("refuses a change without evidence", async () => {
    expect(await decideChange({ ...change, evidence: "" })).toMatchObject({ saved: false, reason: "invalid" });
  });
});
