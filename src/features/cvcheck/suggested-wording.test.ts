import { describe, expect, it } from "vitest";
import { suggestedWordings } from "./suggested-wording";

describe("suggestedWordings", () => {
  it("finds the new wording in single quotes, not the CV's own words in double quotes", () => {
    expect(suggestedWordings(`Change "Responsible for the rota" to 'Planned the weekly staff rota for 12 people'.`)).toEqual([
      "Planned the weekly staff rota for 12 people",
    ]);
  });

  it("keeps an apostrophe inside the wording", () => {
    expect(suggestedWordings("Write 'Managed the team's weekly rota' instead.")).toEqual(["Managed the team's weekly rota"]);
  });

  it("finds curly quotes and more than one suggestion, once each", () => {
    expect(
      suggestedWordings("Add ‘Trained five new advisers’ and, if true, 'Led a team of four', or ‘Trained five new advisers’."),
    ).toEqual(["Led a team of four", "Trained five new advisers"]);
  });

  it("leaves out single words, which are quicker to type than to copy", () => {
    expect(suggestedWordings("Add a short 'Skills' section and change \"colors\" to 'colours'.")).toEqual([]);
  });

  it("finds nothing in a fix without suggested wording, or with only apostrophes", () => {
    expect(suggestedWordings("If you know the figure, add it. Don't guess.")).toEqual([]);
    expect(suggestedWordings("")).toEqual([]);
  });
});
