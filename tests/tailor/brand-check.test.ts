import { describe, expect, it } from "vitest";
import { findBrandProblems } from "@/features/tailor/brand-check";
import { brand } from "@/shared/brand";

describe("findBrandProblems", () => {
  it.each(brand.bannedPhrases)("finds the banned phrase “%s”", (phrase) => {
    expect(findBrandProblems(`This is ${phrase.toUpperCase()} for you.`)).toEqual([
      { kind: "banned-phrase", found: phrase.toUpperCase(), suggestion: "" },
    ]);
  });

  it("finds American spellings and gives the UK form, keeping capitals", () => {
    expect(findBrandProblems("Color and behavior at the center of my organization.")).toEqual([
      { kind: "us-spelling", found: "Color", suggestion: "Colour" },
      { kind: "us-spelling", found: "behavior", suggestion: "behaviour" },
      { kind: "us-spelling", found: "center", suggestion: "centre" },
      { kind: "us-spelling", found: "organization", suggestion: "organisation" },
    ]);
  });

  it("catches -ize and -yze words", () => {
    expect(findBrandProblems("I analyzed data and prioritized work.").map((problem) => problem.suggestion)).toEqual([
      "analysed",
      "prioritised",
    ]);
  });

  it("leaves UK English and words like size and prize alone", () => {
    expect(findBrandProblems("I organised the colour scheme, won a prize and cut the team size. We tailored every CV.")).toEqual([]);
  });

  it("flags résumé as a document but not resume as a verb", () => {
    expect(findBrandProblems("Upload your resume.")).toEqual([{ kind: "us-spelling", found: "resume", suggestion: "CV" }]);
    expect(findBrandProblems("I will resume work in May.")).toEqual([]);
  });
});
