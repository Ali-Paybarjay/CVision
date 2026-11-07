import { describe, expect, it } from "vitest";
import { suggestedWordings } from "./suggested-wording";

// The rule the page keeps: offer only wording it is sure of, cut exactly, and never text the fix says not to write.

describe("suggestedWordings", () => {
  it("finds the new wording in single quotes, not the CV's own words in double quotes", () => {
    expect(suggestedWordings(`Change "Responsible for the rota" to 'Planned the weekly staff rota for 12 people'.`)).toEqual([
      "Planned the weekly staff rota for 12 people",
    ]);
  });

  it("keeps an apostrophe inside a word in the wording", () => {
    expect(suggestedWordings("Write 'Managed the team's weekly rota' instead.")).toEqual(["Managed the team's weekly rota"]);
    expect(suggestedWordings("Write 'Managed the shop through the '90s' if true.")).toEqual(["Managed the shop through the '90s"]);
    expect(suggestedWordings("Write 'Grew sales by 15% ('22–'23)'.")).toEqual(["Grew sales by 15% ('22–'23)"]);
  });

  // The end-of-batch review found the wording running on to a possessive later in the fix.
  it("stops at the first closing quote, even with a plural possessive later in the fix", () => {
    expect(
      suggestedWordings(
        `Change "Responsible for the till" to 'Handled cash and card payments at the till'. Give referees' details only when an employer asks.`,
      ),
    ).toEqual(["Handled cash and card payments at the till"]);
    expect(
      suggestedWordings(`Change "Responsible for the tills" to 'Balanced two tills a day with no shortfalls' if that is true; it answers employers' first question.`),
    ).toEqual(["Balanced two tills a day with no shortfalls"]);
    expect(suggestedWordings(`Change "Helped customers" to 'Served about 80 customers a day', so it fits recruiters' screens.`)).toEqual([
      "Served about 80 customers a day",
    ]);
    expect(suggestedWordings(`Change "color" to 'colour'; UK employers' systems check spelling.`)).toEqual([]);
  });

  it("offers nothing when it can't tell which quote closes the wording", () => {
    expect(suggestedWordings("Write 'Managed the Smiths' account' if that is right.")).toEqual([]);
    expect(suggestedWordings("Write 'Played in a rock 'n' roll covers band' only if relevant.")).toEqual([]);
    expect(suggestedWordings("Try 'Ran the Smiths' accounts' and 'Led a team of four'.")).toEqual(["Led a team of four"]);
  });

  it("closes the wording at punctuation, an em dash, a slash, an ellipsis or a bracket, and keeps suggestions apart", () => {
    expect(suggestedWordings("Change it to 'Led a team of four'—only if true. Then add 'Cut costs by 10%'.")).toEqual([
      "Led a team of four",
      "Cut costs by 10%",
    ]);
    expect(suggestedWordings("Use 'Planned the rota'/'Organised the rota'.")).toEqual(["Planned the rota", "Organised the rota"]);
    expect(suggestedWordings("Either 'Planned the rota','Organised the rota' works.")).toEqual(["Planned the rota", "Organised the rota"]);
    expect(suggestedWordings("Try 'Led a team of four'… or 'Trained five new advisers'.")).toEqual([
      "Led a team of four",
      "Trained five new advisers",
    ]);
    expect(suggestedWordings("Try 'Led a team of four'] as it answers employers' first question.")).toEqual(["Led a team of four"]);
    expect(suggestedWordings("Add a result ['Led a team of four'] here.")).toEqual(["Led a team of four"]);
  });

  it("keeps punctuation that ends the wording itself", () => {
    expect(suggestedWordings("Add a heading 'Key achievements:'.")).toEqual(["Key achievements:"]);
    expect(suggestedWordings("Begin with 'In my last role,'.")).toEqual(["In my last role,"]);
  });

  it("ignores single quotes inside the CV's own double-quoted words, but keeps double quotes inside the wording", () => {
    expect(suggestedWordings(`The line "Handled 'key accounts' daily" is vague. Write 'Looked after 12 key accounts'.`)).toEqual([
      "Looked after 12 key accounts",
    ]);
    expect(suggestedWordings("The line “Handled 'key accounts' daily” is vague.")).toEqual([]);
    expect(suggestedWordings(`Change "Employee of the month" to 'Named "Employee of the Month" twice in 2023'.`)).toEqual([
      `Named "Employee of the Month" twice in 2023`,
    ]);
    expect(suggestedWordings("Write 'Won the “Star Seller” award in 2022' instead.")).toEqual(["Won the “Star Seller” award in 2022"]);
  });

  it("pairs each kind of quote with its own kind", () => {
    expect(suggestedWordings("Write ‘Won the 'Best Store' award in 2022’ instead.")).toEqual(["Won the 'Best Store' award in 2022"]);
    expect(
      suggestedWordings("Add ‘Trained five new advisers’ and, if true, 'Led a team of four', or ‘Trained five new advisers’."),
    ).toEqual(["Trained five new advisers", "Led a team of four"]);
  });

  it("leaves out wording the fix says not to write", () => {
    expect(suggestedWordings("Change it to 'Analysed sales data in Excel'. Don't add 'Power BI' unless you used it.")).toEqual([
      "Analysed sales data in Excel",
    ]);
    expect(suggestedWordings("Don't write 'Familiar with SQL' if you've never used it.")).toEqual([]);
    expect(suggestedWordings("Remove 'References available on request' entirely.")).toEqual([]);
    expect(suggestedWordings("Use 'Planned the weekly rota', not 'Did the rota'.")).toEqual(["Planned the weekly rota"]);
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
