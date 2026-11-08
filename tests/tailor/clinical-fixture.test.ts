import { describe, expect, it } from "vitest";
import { skillGaps } from "@/features/tailor";
import { clinicalFixtures } from "./clinical-fixture";

describe("the clinical fixture (#402)", () => {
  const { profile, job, match } = clinicalFixtures;

  it("is a long, NHS Jobs style ad with a grouped person specification", () => {
    expect(job.description.length).toBeGreaterThanOrEqual(10_000);
    expect(job.description.length).toBeLessThanOrEqual(14_000);
    for (const heading of ["Person specification", "Qualifications", "Experience", "Skills and Abilities", "Knowledge", "Communication", "Personal development", "Specific requirements"]) {
      expect(job.description).toContain(`\n${heading}\n`);
    }
  });

  it("lists every criterion of the person specification, word for word from the ad", () => {
    const criteria = [...job.requirements.essential, ...job.requirements.desirable];
    expect(criteria.length).toBeGreaterThanOrEqual(15);
    expect(criteria.length).toBeLessThanOrEqual(20);
    for (const criterion of criteria) expect(job.description).toContain(`- ${criterion}\n`);
  });

  it("has gaps for requirements of this job only, and a match for this job", () => {
    const criteria = [...job.requirements.essential, ...job.requirements.desirable];
    expect(match.jobId).toBe(job.id);
    for (const gap of match.gaps) expect(criteria).toContain(gap.requirement);
  });

  // The licence to practise gap is kept only from #401 on; its unit test lives in gap-questions.test.ts.
  it("leaves out the DBS and right to work gaps before any question is asked", () => {
    const kept = skillGaps(match.gaps).map((gap) => gap.requirement);
    expect(kept).not.toContain("Enhanced DBS check");
    expect(kept).not.toContain("Right to work in the UK");
  });

  it("gives the nurse NMC registration with no number", () => {
    expect(profile.certifications.map((item) => item.name).join(" ")).toContain("NMC registered");
    expect(JSON.stringify(profile)).not.toMatch(/\b\d{2}[A-Z]\d{4}[A-Z]\b/);
  });
});
