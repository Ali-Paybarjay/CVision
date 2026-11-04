import { describe, expect, it } from "vitest";
import { sampleProposals } from "@/features/tailor";
import { cvLines } from "@/features/tailor/nothing-invented";
import { personas } from "@/shared/sample-data";
import { ad, cv, matchRows, requirementGroups } from "./sara-example";

// The home page's example comes from Sara's sample match and proposal, so it shows what Tailor really does (#176).
const sara = personas.sara;

describe("the home page's match rows", () => {
  it("list every requirement in the ad once, Essential first", () => {
    const ad = sara.jobs[0].requirements;
    expect(matchRows.map((row) => row.text)).toEqual([...ad.essential, ...ad.desirable]);
    expect(matchRows.map((row) => row.need)).toEqual([...ad.essential.map(() => "Essential"), ...ad.desirable.map(() => "Desirable")]);
  });

  it("mark Matched only what the CV shows, with the CV's own words", () => {
    for (const row of matchRows.filter((item) => item.status === "matched")) {
      const strength = sara.match.strengths.find((item) => item.requirement === row.text);
      expect(row.evidence).toEqual({ from: "cv", quote: strength?.evidence });
    }
    expect(matchRows.filter((row) => row.status === "matched")).toHaveLength(sara.match.strengths.length);
  });

  it("mark Tailored only what Sara's own answer covers, numbered in the proposal's order", () => {
    const tailored = matchRows.filter((row) => row.status === "tailored");
    expect(tailored.map((row) => [row.text, row.line])).toEqual([
      ["Clear communication with non-technical stakeholders", 1],
      ["Git", 2],
    ]);
    expect(tailored[0].evidence).toEqual({ from: "answer", quote: sampleProposals.sara.changes[0].evidence, before: sampleProposals.sara.changes[0].before });
    expect(tailored[1].evidence).toMatchObject({ from: "answer", before: null });
  });

  it("leave everything else Not on your CV, and add nothing for it (Honest CV Promise)", () => {
    const missing = matchRows.filter((row) => row.status === "missing").map((row) => row.text);
    expect(missing).toEqual(["Power BI", "Healthcare or NHS data"]);
    const tailoredText = [...cv.role.lines, ...cv.addedSkills].map((line) => line.text).join(" ");
    expect(tailoredText).not.toMatch(/Power BI|NHS|healthcare/i);
  });
});

describe("the home page's CV and job ad", () => {
  it("number the same lines in the CV as in the ad", () => {
    const cvNumbers = [...cv.role.lines, ...cv.addedSkills].flatMap((line) => (line.line ? [line.line] : []));
    const adNumbers = requirementGroups.flatMap((group) => group.items.flatMap((item) => (item.line ? [item.line] : [])));
    expect(cvNumbers.sort()).toEqual([1, 2]);
    expect(adNumbers.sort()).toEqual([1, 2]);
  });

  it("show only lines from Sara's Profile or from an approved change", () => {
    const allowed = new Set([...cvLines(sara.profile), ...sampleProposals.sara.changes.map((change) => change.after)]);
    for (const line of [...cv.role.lines, ...cv.addedSkills]) expect(allowed.has(line.text), line.text).toBe(true);
  });

  it("describes the ad from the sample job", () => {
    expect(ad).toEqual({ title: "Junior Data Analyst", company: "Pennine Health Analytics", details: ["Manchester", "£29,000 to £32,000", "Hybrid"] });
    expect(cv.role.dates).toBe("Jun 2025 – Sept 2025");
  });
});
