import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { fixtures } from "@/features/interview/fixtures";
import { sampleApplications } from "@/features/tracker/sample";
import {
  ApplicationSchema,
  ApplicationStatusSchema,
  JobSchema,
  MatchResultSchema,
  ProfileSchema,
  TailoredCvSchema,
  TailoringChangeSchema,
  type Application,
  type TailoredCv,
  type TailoringChange,
} from "@/shared/contracts";

const personasDir = join(process.cwd(), "sample-data", "personas");
const personaNames = readdirSync(personasDir);

function readJson(...parts: string[]): unknown {
  return JSON.parse(readFileSync(join(personasDir, ...parts), "utf8"));
}

describe("sample data matches the contracts", () => {
  it("has the four personas", () => {
    expect(personaNames.sort()).toEqual(["daniel", "emma", "reza", "sara"]);
  });

  describe.each(personaNames)("%s", (name) => {
    it("has a valid Profile", () => {
      expect(() => ProfileSchema.parse(readJson(name, "profile.json"))).not.toThrow();
    });

    it("has two valid Jobs", () => {
      expect(() => z.array(JobSchema).length(2).parse(readJson(name, "jobs.json"))).not.toThrow();
    });

    it("has a valid MatchResult for its first Job", () => {
      const jobs = z.array(JobSchema).parse(readJson(name, "jobs.json"));
      const match = MatchResultSchema.parse(readJson(name, "match.json"));
      expect(match.jobId).toBe(jobs[0].id);
    });

    it("parses unchanged: the contracts add nothing to it and drop nothing from it", () => {
      const profile = readJson(name, "profile.json");
      const jobs = readJson(name, "jobs.json");
      const match = readJson(name, "match.json");
      expect(ProfileSchema.parse(profile)).toEqual(profile);
      expect(z.array(JobSchema).parse(jobs)).toEqual(jobs);
      expect(MatchResultSchema.parse(match)).toEqual(match);
    });
  });
});

describe("sample-data module", () => {
  it("loads every persona", async () => {
    const { personas } = await import("@/shared/sample-data");
    expect(Object.keys(personas).sort()).toEqual(["daniel", "emma", "reza", "sara"]);
  });
});

describe("fixtures written before the optional fields still parse unchanged", () => {
  it.each(fixtures.map((fixture) => [fixture.id, fixture] as const))("interview fixture %s", (_, fixture) => {
    expect(JobSchema.parse(fixture.job)).toEqual(fixture.job);
    expect(ProfileSchema.parse(fixture.profile)).toEqual(fixture.profile);
  });

  it("the tracker's sample applications", () => {
    for (const { application } of sampleApplications) expect(ApplicationSchema.parse(application)).toEqual(application);
  });
});

// The optional fields agreed in issue #67. Each one is valid with a value and without one, so data saved before it,
// and code that builds these objects without it, keeps working.

const application: Application = {
  id: "a1",
  jobId: "sara-job-1",
  date: "2026-10-20",
  status: "applied",
  nextStep: null,
};

/** Sara's first job without the two new fields. */
const job = JobSchema.omit({ deadline: true, eligibility: true }).parse((readJson("sara", "jobs.json") as unknown[])[0]);

const change: TailoringChange = {
  id: "c1",
  jobId: "sara-job-1",
  section: "skills",
  before: null,
  after: "Power BI",
  evidence: "I built three Power BI dashboards for the stock team.",
  evidenceSource: "follow-up-answer",
  status: "approved",
};

function tailoredCv(overrides: Partial<TailoredCv> = {}): Record<string, unknown> {
  return {
    id: "t1",
    jobId: "sara-job-1",
    cv: ProfileSchema.parse(readJson("sara", "profile.json")),
    changes: [change],
    coverLetter: "Dear Hiring Manager,\n\nI am applying for the Junior Data Analyst role.",
    savedAt: "2026-10-26T09:30:00Z",
    ...overrides,
  };
}

describe("contracts keep the Honest CV Promise", () => {
  it("rejects a TailoringChange with no evidence", () => {
    const change = {
      id: "c1",
      jobId: "j1",
      section: "skills",
      before: null,
      after: "Power BI",
      evidence: "",
      evidenceSource: "follow-up-answer",
      status: "proposed",
    };
    expect(TailoringChangeSchema.safeParse(change).success).toBe(false);
  });

  it("rejects a TailoredCv whose changes have no evidence", () => {
    expect(TailoredCvSchema.safeParse(tailoredCv({ changes: [{ ...change, evidence: "" }] })).success).toBe(false);
  });
});

describe("Application", () => {
  it.each(["ready", "applied", "interview", "offer", "rejected", "no_response", "withdrawn", "accepted"])(
    "accepts the status %s",
    (status) => {
      expect(ApplicationSchema.safeParse({ ...application, status }).success).toBe(true);
    },
  );

  it("rejects a status the contract does not name", () => {
    expect(ApplicationStatusSchema.safeParse("ghosted").success).toBe(false);
  });

  it("is valid without followUps, with none, and with a follow-up and a thank-you note", () => {
    expect(ApplicationSchema.parse(application)).toEqual(application);
    expect(ApplicationSchema.parse({ ...application, followUps: [] }).followUps).toEqual([]);
    const followUps = [
      { kind: "follow-up", date: "2026-10-30" },
      { kind: "thank-you", date: "2026-11-05" },
    ];
    expect(ApplicationSchema.parse({ ...application, followUps }).followUps).toEqual(followUps);
  });

  it("rejects a follow-up of an unknown kind or without a calendar date", () => {
    for (const followUp of [{ kind: "chaser", date: "2026-10-30" }, { kind: "follow-up", date: "30 October" }, { kind: "follow-up" }]) {
      expect(ApplicationSchema.safeParse({ ...application, followUps: [followUp] }).success, JSON.stringify(followUp)).toBe(false);
    }
  });

  it("is valid without nextStepDate, with null and with a calendar date, and adds no default (#211)", () => {
    expect(ApplicationSchema.parse(application)).not.toHaveProperty("nextStepDate");
    expect(ApplicationSchema.parse({ ...application, nextStepDate: null }).nextStepDate).toBeNull();
    expect(ApplicationSchema.parse({ ...application, nextStepDate: "2026-10-31" }).nextStepDate).toBe("2026-10-31");
    for (const nextStepDate of ["Friday", "31 October", 2]) {
      expect(ApplicationSchema.safeParse({ ...application, nextStepDate }).success, String(nextStepDate)).toBe(false);
    }
  });
});

describe("Job", () => {
  it("is valid without a deadline, with null (none given, or ASAP) and with a calendar date", () => {
    expect(JobSchema.parse(job)).not.toHaveProperty("deadline");
    expect(JobSchema.parse({ ...job, deadline: null }).deadline).toBeNull();
    expect(JobSchema.parse({ ...job, deadline: "2026-11-13" }).deadline).toBe("2026-11-13");
  });

  it("rejects a deadline that is not a calendar date", () => {
    for (const deadline of ["13 November 2026", "ASAP", ""]) {
      expect(JobSchema.safeParse({ ...job, deadline }).success, deadline).toBe(false);
    }
  });

  it("is valid without eligibility, and with what the ad says or does not say", () => {
    expect(JobSchema.parse(job)).not.toHaveProperty("eligibility");
    const stated = {
      sponsorship: "not-offered",
      ukNationalsOnly: false,
      securityVetting: "bpss",
      quotes: ["We are unable to offer visa sponsorship for this role.", "The successful candidate will need BPSS clearance."],
    };
    expect(JobSchema.parse({ ...job, eligibility: stated }).eligibility).toEqual(stated);
    const silent = { sponsorship: "not-stated", ukNationalsOnly: false, securityVetting: null, quotes: [] };
    expect(JobSchema.parse({ ...job, eligibility: silent }).eligibility).toEqual(silent);
  });

  it("rejects eligibility with an empty quote, an unknown answer or a missing part", () => {
    const valid = { sponsorship: "offered", ukNationalsOnly: false, securityVetting: null, quotes: ["Visa sponsorship is available."] };
    for (const eligibility of [
      { ...valid, quotes: [""] },
      { ...valid, sponsorship: "maybe" },
      { ...valid, securityVetting: "nppv" },
      { sponsorship: "offered", quotes: [] },
    ]) {
      expect(JobSchema.safeParse({ ...job, eligibility }).success, JSON.stringify(eligibility)).toBe(false);
    }
  });
});

describe("TailoringChange", () => {
  it("is valid without a stretch note and with one", () => {
    expect(TailoringChangeSchema.parse(change)).toEqual(change);
    const stretched = { ...change, stretch: "“Led” goes further than your “helped with”." };
    expect(TailoringChangeSchema.parse(stretched).stretch).toBe(stretched.stretch);
  });

  it("rejects an empty stretch note", () => {
    expect(TailoringChangeSchema.safeParse({ ...change, stretch: "" }).success).toBe(false);
  });
});

describe("TailoredCv", () => {
  it("is valid with an approved cover letter and without one", () => {
    const withLetter = tailoredCv();
    expect(TailoredCvSchema.parse(withLetter)).toEqual(withLetter);
    expect(TailoredCvSchema.parse(tailoredCv({ coverLetter: null })).coverLetter).toBeNull();
  });

  it("rejects an empty cover letter, a save time that is not a UTC date and time, and a CV that is not a Profile", () => {
    expect(TailoredCvSchema.safeParse(tailoredCv({ coverLetter: "" })).success).toBe(false);
    expect(TailoredCvSchema.safeParse(tailoredCv({ savedAt: "26 October 2026" })).success).toBe(false);
    expect(TailoredCvSchema.safeParse({ ...tailoredCv(), cv: { fullName: "Sara Khan" } }).success).toBe(false);
  });
});
