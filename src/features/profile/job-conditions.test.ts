import { describe, expect, it } from "vitest";
import type { JobConditionKind } from "@/shared/contracts";
import { conditionGroups, conditionsByWords, jobConditions } from "./job-conditions";

const kindOf = (requirement: string): JobConditionKind | null => conditionsByWords([requirement])[0]?.kind ?? null;

describe("conditionsByWords (the backup for jobs read before the model marked conditions)", () => {
  it.each([
    // The two fictional ads of the 31 October check (#222) and Daniel's second sample ad.
    ["Full clean driving licence", "credential"],
    ["Full UK driving licence", "credential"],
    ["CSCS card", "credential"],
    ["Counterbalance forklift licence", "credential"],
    ["SIA door supervisor licence", "credential"],
    ["Willingness to travel within the UK and internationally", "working"],
    ["Willingness to travel across the Midlands, with occasional overnight stays", "working"],
    ["Weekend and night shift cover when needed", "working"],
    ["Able to work evenings and weekends", "working"],
    ["On-call rota one week in four", "working"],
    ["Flexible approach to working hours", "working"],
    ["Willing to relocate to Aberdeen", "working"],
    ["Access to a car for work", "working"],
    ["Enhanced DBS check", "sensitive"],
    ["Able to lift up to 25kg", "sensitive"],
    ["Right to work in the UK", "sensitive"],
    ["SC clearance or willingness to obtain it", "sensitive"],
    ["Full driving licence with no more than 6 penalty points", "sensitive"],
  ] as const)("marks “%s” as %s", (requirement, kind) => {
    expect(kindOf(requirement)).toBe(kind);
  });

  it.each([
    // Real skills the tailor word list once dropped (#246), and requirements the CV shows.
    "Experience with high-availability systems",
    "Supervising shifts of up to 12 staff",
    "Knowledge of Visa payment schemes",
    "Salary benchmarking",
    "Relocation coordination for new starters",
    "Experience in the travel industry",
    "Current NMC registration",
    "Degree in a numerate subject",
    "PRINCE2 or Agile training",
    "Strong health and safety knowledge",
    "Multi-site or large-store management",
    "Experience leading large retail teams",
  ])("leaves “%s” as an ordinary requirement", (requirement) => {
    expect(kindOf(requirement)).toBeNull();
  });
});

describe("jobConditions", () => {
  const requirements = { essential: ["Strong SQL", "Full UK driving licence"], desirable: ["Willing to work weekends"] };

  it("uses the word list for a job read before conditions were marked", () => {
    expect(jobConditions({ requirements })).toEqual([
      { requirement: "Full UK driving licence", kind: "credential" },
      { requirement: "Willing to work weekends", kind: "working" },
    ]);
  });

  it("trusts the model's marks, even none, and never adds the word list's", () => {
    expect(jobConditions({ requirements, conditions: [] })).toEqual([]);
    expect(jobConditions({ requirements, conditions: [{ requirement: "Willing to work weekends", kind: "working" }] })).toEqual([
      { requirement: "Willing to work weekends", kind: "working" },
    ]);
  });

  it("keeps only marks that are one of the requirements word for word, once each", () => {
    const conditions = [
      { requirement: "Full UK driving licence", kind: "credential" as const },
      { requirement: "full UK driving licence", kind: "credential" as const },
      { requirement: "Full UK driving licence", kind: "sensitive" as const },
      { requirement: "Night shifts", kind: "working" as const },
    ];
    expect(jobConditions({ requirements, conditions })).toEqual([{ requirement: "Full UK driving licence", kind: "credential" }]);
  });
});

describe("conditionGroups", () => {
  it("groups the conditions as licences and cards, working conditions, then the ones to check, and marks desirable ones", () => {
    const groups = conditionGroups({
      requirements: {
        essential: ["Enhanced DBS check", "Experience leading large retail teams", "Full clean driving licence", "Weekend and night shift cover when needed"],
        desirable: ["CSCS card"],
      },
    });

    expect(groups).toEqual([
      {
        kind: "credential",
        items: [
          { requirement: "Full clean driving licence", desirable: false },
          { requirement: "CSCS card", desirable: true },
        ],
      },
      { kind: "working", items: [{ requirement: "Weekend and night shift cover when needed", desirable: false }] },
      { kind: "sensitive", items: [{ requirement: "Enhanced DBS check", desirable: false }] },
    ]);
  });

  it("is empty for a job with no conditions", () => {
    expect(conditionGroups({ requirements: { essential: ["Strong SQL"], desirable: [] } })).toEqual([]);
  });
});
