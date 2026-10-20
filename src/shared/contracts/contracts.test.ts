import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { JobSchema, MatchResultSchema, ProfileSchema, TailoringChangeSchema } from "@/shared/contracts";

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
  });
});

describe("sample-data module", () => {
  it("loads every persona", async () => {
    const { personas } = await import("@/shared/sample-data");
    expect(Object.keys(personas).sort()).toEqual(["daniel", "emma", "reza", "sara"]);
  });
});

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
});
