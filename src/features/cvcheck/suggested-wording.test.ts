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

  it("keeps a plural possessive inside the wording", () => {
    expect(suggestedWordings("Write 'Managed the Smiths' account' if that is right.")).toEqual(["Managed the Smiths' account"]);
    expect(suggestedWordings("Try 'Ran the Smiths' accounts' and 'Led a team of four'.")).toEqual([
      "Ran the Smiths' accounts",
      "Led a team of four",
    ]);
  });

  it("closes the wording at an em dash or a slash, and keeps the next suggestion apart", () => {
    expect(suggestedWordings("Change it to 'Led a team of four'—only if true. Then add 'Cut costs by 10%'.")).toEqual([
      "Led a team of four",
      "Cut costs by 10%",
    ]);
    expect(suggestedWordings("Use 'Planned the rota'/'Organised the rota'.")).toEqual(["Planned the rota", "Organised the rota"]);
    expect(suggestedWordings("Either 'Planned the rota','Organised the rota' works.")).toEqual(["Planned the rota", "Organised the rota"]);
  });

  it("ignores single quotes inside the CV's own double-quoted words", () => {
    expect(suggestedWordings(`The line "Handled 'key accounts' daily" is vague. Write 'Looked after 12 key accounts'.`)).toEqual([
      "Looked after 12 key accounts",
    ]);
    expect(suggestedWordings("The line “Handled 'key accounts' daily” is vague.")).toEqual([]);
  });

  it("finds curly quotes and more than one suggestion, once each", () => {
    expect(
      suggestedWordings("Add ‘Trained five new advisers’ and, if true, 'Led a team of four', or ‘Trained five new advisers’."),
    ).toEqual(["Trained five new advisers", "Led a team of four"]);
  });

  it("leaves out single words, which are quicker to type than to copy", () => {
    expect(suggestedWordings("Add a short 'Skills' section and change \"colors\" to 'colours'.")).toEqual([]);
  });

  it("finds nothing in a fix without suggested wording, or with only apostrophes", () => {
    expect(suggestedWordings("If you know the figure, add it. Don't guess, and check the Smiths' dates.")).toEqual([]);
    expect(suggestedWordings("An unclosed 'quote here")).toEqual([]);
    expect(suggestedWordings("")).toEqual([]);
  });
});
