import { describe, expect, it } from "vitest";
import type { Job, Profile } from "@/shared/contracts";
import { personas, type PersonaName } from "@/shared/sample-data";
import {
  assessByRules,
  buildMatchResult,
  jobRequirements,
  matchScore,
  profileEvidenceLines,
  summariseMatch,
  type MatchAssessment,
} from "./match";

const names = Object.keys(personas) as PersonaName[];
const sara = personas.sara.profile;
const saraJob = personas.sara.jobs[0];

/** The line id of a profile line, found by its text. */
function lineId(profile: Profile, text: string): string {
  const line = profileEvidenceLines(profile).find((candidate) => candidate.text === text);
  if (!line) throw new Error(`No line "${text}"`);
  return line.id;
}

/** A model-like answer for Sara's first job. */
function saraAssessment(): MatchAssessment {
  return {
    requirements: [
      { id: "E1", status: "met", evidence: lineId(sara, "SQL"), detail: "" },
      { id: "E2", status: "met", evidence: lineId(sara, "R"), detail: "" },
      { id: "E3", status: "met", evidence: lineId(sara, "Built Tableau dashboards for the regional sales team"), detail: "" },
      { id: "E4", status: "unclear", evidence: "", detail: "Your CV doesn’t say how you explained results." },
      { id: "D1", status: "missing", evidence: "", detail: "Tableau is on your CV; Power BI is not." },
      { id: "D2", status: "missing", evidence: "", detail: "" },
      { id: "D3", status: "missing", evidence: "", detail: "No version control is mentioned." },
    ],
    reasoning: "You meet three of the four essentials. Explaining results to non-analysts isn’t shown yet.",
  };
}

describe("profileEvidenceLines", () => {
  it("numbers every line that can be evidence, without the name or contact details", () => {
    for (const name of names) {
      const profile = personas[name].profile;
      const lines = profileEvidenceLines(profile);
      const all = lines.map((line) => `${line.text} ${line.context ?? ""}`).join("\n");

      expect(lines.map((line) => line.id)).toEqual(lines.map((_, index) => `L${index + 1}`));
      for (const personal of [profile.fullName, profile.contact.email, profile.contact.phone].filter(Boolean)) {
        expect(all).not.toContain(personal);
      }
    }
  });

  it("includes skills, duties, achievements, qualifications and follow-up answers", () => {
    const texts = profileEvidenceLines(sara).map((line) => line.text);

    expect(texts).toContain("SQL");
    expect(texts).toContain("Built Tableau dashboards for the regional sales team");
    expect(texts).toContain("Automated a weekly stock report, cutting preparation time from 4 hours to 30 minutes");
    expect(texts.some((text) => text.startsWith("MSc in Data Science"))).toBe(true);
    expect(texts).toContain(sara.followUpAnswers[0].answer);
  });
});

describe("jobRequirements", () => {
  it("numbers essential requirements E1… and desirable ones D1…", () => {
    expect(jobRequirements(saraJob).map((requirement) => requirement.id)).toEqual(["E1", "E2", "E3", "E4", "D1", "D2", "D3"]);
  });
});

describe("buildMatchResult", () => {
  it("quotes the profile line each strength points at, word for word", () => {
    const { match, unsupported } = buildMatchResult(saraJob, sara, saraAssessment());

    expect(unsupported).toEqual([]);
    expect(match.jobId).toBe(saraJob.id);
    expect(match.strengths).toEqual([
      { requirement: "Strong SQL", evidence: "SQL" },
      { requirement: "Python or R for analysis", evidence: "R" },
      { requirement: "Dashboards in Power BI or Tableau", evidence: "Built Tableau dashboards for the regional sales team" },
    ]);
    expect(match.reasoning).toBe(saraAssessment().reasoning);
  });

  it("turns every other requirement into one gap, and lists the missing ones as uncovered", () => {
    const { match } = buildMatchResult(saraJob, sara, saraAssessment());

    expect(match.gaps.map((gap) => [gap.id, gap.requirement, gap.importance, gap.kind])).toEqual([
      ["gap-1", "Clear communication with non-technical stakeholders", "essential", "unclear"],
      ["gap-2", "Power BI", "desirable", "missing"],
      ["gap-3", "Healthcare or NHS data", "desirable", "missing"],
      ["gap-4", "Git", "desirable", "missing"],
    ]);
    expect(match.gaps[1].detail).toBe("Tableau is on your CV; Power BI is not.");
    expect(match.gaps[2].detail).toBe("Nothing in your profile shows this yet.");
    expect(match.uncoveredRequirements).toEqual(["Power BI", "Healthcare or NHS data", "Git"]);
  });

  it("works out the score from the verdicts: 3 essentials met, 1 unclear, 3 desirables missing", () => {
    // (3 × 3 + 3 × 0.5) out of (4 × 3 + 3 × 1) = 10.5 / 15
    expect(buildMatchResult(saraJob, sara, saraAssessment()).match.score).toBe(70);
  });

  it("never keeps a strength without a real profile line behind it", () => {
    const assessment = saraAssessment();
    assessment.requirements[0] = { id: "E1", status: "met", evidence: "L999", detail: "" };
    assessment.requirements[1] = { id: "E2", status: "met", evidence: "Five years of R at the NHS", detail: "" };

    const { match, unsupported } = buildMatchResult(saraJob, sara, assessment);

    expect(unsupported).toEqual(["Strong SQL", "Python or R for analysis"]);
    expect(match.strengths.map((strength) => strength.requirement)).toEqual(["Dashboards in Power BI or Tableau"]);
    expect(match.gaps.filter((gap) => gap.kind === "unclear").map((gap) => gap.requirement)).toContain("Strong SQL");
    // The model's reasoning may praise what was removed, so it is replaced.
    expect(match.reasoning).not.toBe(assessment.reasoning);
    expect(match.reasoning).toContain("1 of the 4 essential requirements");
  });

  it("reads ids written in another case or with spaces", () => {
    const assessment = saraAssessment();
    assessment.requirements[0] = { id: " e1 ", status: "met", evidence: ` ${lineId(sara, "SQL").toLowerCase()} `, detail: "" };

    expect(buildMatchResult(saraJob, sara, assessment).match.strengths[0]).toEqual({ requirement: "Strong SQL", evidence: "SQL" });
  });

  it("treats a requirement the model skipped as unclear, and writes the reasoning itself", () => {
    const assessment = saraAssessment();
    assessment.requirements = assessment.requirements.filter((answer) => answer.id !== "E4");

    const { match } = buildMatchResult(saraJob, sara, assessment);

    expect(match.gaps[0]).toMatchObject({ requirement: "Clear communication with non-technical stakeholders", kind: "unclear" });
    expect(match.reasoning).not.toBe(assessment.reasoning);
  });

  it("ignores answers for requirements the job doesn't have", () => {
    const assessment = saraAssessment();
    assessment.requirements.push({ id: "E9", status: "met", evidence: lineId(sara, "SQL"), detail: "" });

    expect(buildMatchResult(saraJob, sara, assessment).match.strengths).toHaveLength(3);
  });
});

describe("matchScore", () => {
  const item = (importance: "essential" | "desirable", status: "met" | "unclear" | "missing") => ({ importance, status });

  it("is 100 when everything is met and 0 when nothing is", () => {
    expect(matchScore([item("essential", "met"), item("desirable", "met")])).toBe(100);
    expect(matchScore([item("essential", "missing"), item("desirable", "missing")])).toBe(0);
  });

  it("counts essentials three times as much as desirables, and unclear as half", () => {
    expect(matchScore([item("essential", "met"), item("desirable", "missing")])).toBe(75);
    expect(matchScore([item("essential", "missing"), item("desirable", "met")])).toBe(25);
    expect(matchScore([item("essential", "unclear")])).toBe(50);
  });

  it("is 0 for an ad with no requirements", () => {
    expect(matchScore([])).toBe(0);
  });
});

describe("summariseMatch", () => {
  const item = (text: string, importance: "essential" | "desirable", status: "met" | "unclear" | "missing") => ({
    text,
    importance,
    status,
  });

  it("says when the ad has no requirements to match", () => {
    expect(summariseMatch([])).toContain("couldn’t find a list of requirements");
  });

  it("names the essentials to work on first", () => {
    const text = summariseMatch([item("SQL", "essential", "met"), item("Python", "essential", "missing"), item("Git", "desirable", "missing")]);

    expect(text).toBe(
      "Your profile clearly shows 1 of the 2 essential requirements and 0 of the 1 desirable ones. The essentials to work on: “Python”.",
    );
  });

  it("moves on to the desirables when every essential is covered", () => {
    expect(summariseMatch([item("SQL", "essential", "met"), item("Git", "desirable", "unclear")])).toContain(
      "Every essential requirement is covered. The employer would also like “Git”.",
    );
  });

  it("keeps a long list short", () => {
    const text = summariseMatch(["A", "B", "C", "D", "E"].map((name) => item(name, "essential", "missing")));
    expect(text).toContain("“A”, “B”, “C” and 2 more.");
  });
});

describe("assessByRules (the mock answer)", () => {
  it.each(names)("gives every requirement of %s’s jobs one verdict, with real evidence for each strength", (name) => {
    const { profile, jobs } = personas[name];
    for (const job of jobs) {
      const assessment = assessByRules(profile, job);
      const { match, unsupported } = buildMatchResult(job, profile, assessment);

      expect(assessment.requirements.map((answer) => answer.id)).toEqual(jobRequirements(job).map((r) => r.id));
      expect(unsupported).toEqual([]);
      const lines = profileEvidenceLines(profile).map((line) => line.text);
      for (const strength of match.strengths) expect(lines).toContain(strength.evidence);
      expect(match.strengths.length + match.gaps.length).toBe(jobRequirements(job).length);
    }
  });

  it("finds a requirement in a duty before a bare skills-list entry", () => {
    const { requirements } = assessByRules(sara, saraJob);

    expect(requirements[0]).toMatchObject({ id: "E1", status: "met", evidence: lineId(sara, "Cleaned and joined weekly sales data from 120 stores using SQL and Python") });
  });

  it("matches short names as whole words in the same capitals", () => {
    const profile: Profile = { ...sara, skills: ["Digital marketing"], experience: [], summary: "I write r scripts.", followUpAnswers: [], education: [] };
    const job: Job = { ...saraJob, requirements: { essential: ["Git", "R"], desirable: [] } };

    expect(assessByRules(profile, job).requirements.map((answer) => answer.status)).toEqual(["missing", "missing"]);
  });

  it("calls a partly named requirement unclear, never met", () => {
    const daniel = personas.daniel;
    const { requirements } = assessByRules(daniel.profile, daniel.jobs[0]);

    expect(requirements.find((answer) => answer.id === "E1")?.status).toBe("unclear");
  });
});
