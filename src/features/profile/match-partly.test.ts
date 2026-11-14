import { describe, expect, it } from "vitest";
import type { Profile } from "@/shared/contracts";
import { personas, type PersonaName } from "@/shared/sample-data";
import { assessByRules, buildMatchResult, profileEvidenceLines, type MatchAssessment } from "./match";

// A gap the profile partly shows quotes up to three of its lines (#188, decision 3B). The model only names line ids;
// the code copies the lines, keeps the first three without an error, and never quotes the profile for a missing gap.
// Its own file, so it doesn't meet the changes to match.test.ts in #222.

const sara = personas.sara.profile;
const saraJob = personas.sara.jobs[0];

/** The line id of a profile line, found by its text. */
function lineId(profile: Profile, text: string): string {
  const line = profileEvidenceLines(profile).find((candidate) => candidate.text === text);
  if (!line) throw new Error(`No line "${text}"`);
  return line.id;
}

const sql = lineId(sara, "SQL");
const tableau = lineId(sara, "Built Tableau dashboards for the regional sales team");
const r = lineId(sara, "R");
const excel = lineId(sara, "Excel");

/** A model-like answer for Sara's first job, with E4 ("Clear communication…") unclear and the desirables missing. */
function answer(unclearEvidence: string, missingEvidence = ""): MatchAssessment {
  return {
    requirements: [
      { id: "E1", status: "met", evidence: sql, detail: "" },
      { id: "E2", status: "met", evidence: r, detail: "" },
      { id: "E3", status: "met", evidence: tableau, detail: "" },
      { id: "E4", status: "unclear", evidence: unclearEvidence, detail: "Your profile shows dashboards, but not how you explained them." },
      { id: "D1", status: "missing", evidence: missingEvidence, detail: "" },
      { id: "D2", status: "missing", evidence: "", detail: "" },
      { id: "D3", status: "missing", evidence: "", detail: "" },
    ],
    reasoning: "You meet three of the four essentials.",
  };
}

function firstGap(assessment: MatchAssessment) {
  return buildMatchResult(saraJob, sara, assessment).match.gaps[0];
}

describe("buildMatchResult: the lines behind a gap the profile partly shows (#188)", () => {
  it("quotes the lines word for word, in the model's order", () => {
    expect(firstGap(answer(`${tableau}, ${sql}`))).toMatchObject({
      requirement: "Clear communication with non-technical stakeholders",
      kind: "unclear",
      evidence: ["Built Tableau dashboards for the regional sales team", "SQL"],
    });
  });

  it("keeps the first three without an error when the model gives more", () => {
    expect(firstGap(answer(`${tableau}, ${sql}, ${r}, ${excel}`)).evidence).toEqual([
      "Built Tableau dashboards for the regional sales team",
      "SQL",
      "R",
    ]);
  });

  it("drops ids that aren't in the profile and a line given twice, and reads ids in any case or spacing", () => {
    expect(firstGap(answer(`L999; ${tableau.toLowerCase()} ,${tableau}`)).evidence).toEqual([
      "Built Tableau dashboards for the regional sales team",
    ]);
  });

  it("leaves the quote out when no real line is named", () => {
    expect(firstGap(answer("")).evidence).toBeUndefined();
    expect(firstGap(answer("L999")).evidence).toBeUndefined();
  });

  it("never quotes the profile for a missing requirement, whatever ids the model gave", () => {
    const { match } = buildMatchResult(saraJob, sara, answer(tableau, `${sql}, ${r}`));
    expect(match.gaps.find((gap) => gap.requirement === "Power BI")).toMatchObject({ kind: "missing" });
    expect(match.gaps.filter((gap) => gap.kind === "missing").every((gap) => gap.evidence === undefined)).toBe(true);
  });

  it("still counts an unclear requirement half, with or without lines", () => {
    expect(buildMatchResult(saraJob, sara, answer(`${tableau}, ${sql}`)).match.score).toBe(
      buildMatchResult(saraJob, sara, answer("")).match.score,
    );
  });

  it("takes the first real line for a met requirement given several ids", () => {
    const assessment = answer(tableau);
    assessment.requirements[0] = { id: "E1", status: "met", evidence: `L999, ${sql}, ${r}`, detail: "" };
    expect(buildMatchResult(saraJob, sara, assessment).match.strengths[0]).toEqual({ requirement: "Strong SQL", evidence: "SQL" });
  });
});

describe("assessByRules (the mock answer): partly shown gaps", () => {
  const names = Object.keys(personas) as PersonaName[];
  const results = names.flatMap((name) =>
    personas[name].jobs.map((job) => {
      const profile = personas[name].profile;
      return { profile, match: buildMatchResult(job, profile, assessByRules(profile, job)).match };
    }),
  );

  it("quotes at most three real profile lines for an unclear gap, and none for a missing one", () => {
    for (const { profile, match } of results) {
      const texts = profileEvidenceLines(profile).map((line) => line.text);
      for (const gap of match.gaps) {
        if (gap.kind === "missing") expect(gap.evidence, gap.requirement).toBeUndefined();
        for (const line of gap.evidence ?? []) expect(texts).toContain(line);
        expect((gap.evidence ?? []).length).toBeLessThanOrEqual(3);
      }
    }
  });

  it("shows the lines in the demo too: some sample gap quotes the profile", () => {
    expect(results.some(({ match }) => match.gaps.some((gap) => (gap.evidence ?? []).length > 0))).toBe(true);
  });
});
