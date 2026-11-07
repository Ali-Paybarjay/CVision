import { describe, expect, it } from "vitest";
import { suggestedWordings } from "./suggested-wording";

// The rule the page keeps: never offer wrong text to copy. Missing a suggestion is fine: the fix is still on screen.
// Every case marked "never wrong" here was found by an adversarial review of earlier versions.

describe("suggestedWordings offers the wording", () => {
  it("after 'to' in the usual 'Change \"…\" to …' fix, not the CV's own double-quoted words", () => {
    expect(suggestedWordings(`Change "Responsible for the rota" to 'Planned the weekly staff rota for 12 people'.`)).toEqual([
      "Planned the weekly staff rota for 12 people",
    ]);
  });

  it("after other words that introduce new wording", () => {
    expect(suggestedWordings("Write 'Led a team of four' at the top.")).toEqual(["Led a team of four"]);
    expect(suggestedWordings("Shorten older jobs to one line, for example 'Sales Assistant, Tesco, Leeds, 1996–1999'.")).toEqual([
      "Sales Assistant, Tesco, Leeds, 1996–1999",
    ]);
    expect(suggestedWordings("Add a short profile, e.g. 'Customer service adviser looking for a team leader role'.")).toEqual([
      "Customer service adviser looking for a team leader role",
    ]);
    expect(suggestedWordings("Replace it with 'Grew sales by 10% in 2023'.")).toEqual(["Grew sales by 10% in 2023"]);
  });

  it("in each sentence of a fix, once", () => {
    expect(suggestedWordings("Change it to 'Led a team of four'—only if true. Then add 'Cut costs by 10%'.")).toEqual([
      "Led a team of four",
      "Cut costs by 10%",
    ]);
    expect(suggestedWordings("Write 'Led a team of four'. Again, write 'Led a team of four'.")).toEqual(["Led a team of four"]);
  });

  it("when a possessive comes later, in another sentence or clause", () => {
    expect(
      suggestedWordings(`Change "Responsible for the till" to 'Handled cash and card payments at the till'. Give referees' details later.`),
    ).toEqual(["Handled cash and card payments at the till"]);
    expect(
      suggestedWordings(`Change "Responsible for the tills" to 'Balanced two tills a day with no shortfalls' if true; it answers employers' first question.`),
    ).toEqual(["Balanced two tills a day with no shortfalls"]);
  });

  it("with the CV's double-quoted words inside it, kept whole", () => {
    expect(suggestedWordings(`Change "Employee of the month" to 'Named "Employee of the Month" twice in 2023'.`)).toEqual([
      `Named "Employee of the Month" twice in 2023`,
    ]);
  });
});

describe("suggestedWordings never offers wrong text", () => {
  it("cut short by an apostrophe inside the wording: it offers nothing instead", () => {
    expect(suggestedWordings("Write 'Managed the team's weekly rota' instead.")).toEqual([]);
    expect(suggestedWordings("Add a profile such as 'Customer service adviser with 4 years' experience in busy call centres'.")).toEqual([]);
    expect(suggestedWordings("Write 'Handled customers' complaints, refunds and exchanges' instead.")).toEqual([]);
    expect(suggestedWordings(`Change "Helped customers" to 'Cut customers' waiting times by 10.5%'.`)).toEqual([]);
    expect(suggestedWordings("Write 'Managed the Smiths' account' if that is right.")).toEqual([]);
    expect(suggestedWordings("Write 'Played in a rock 'n' roll covers band' only if relevant.")).toEqual([]);
    expect(suggestedWordings("Write 'Managed the shop through the '90s' if true.")).toEqual([]);
  });

  it("run on to a possessive later in the same sentence: it offers nothing instead", () => {
    expect(suggestedWordings("Write 'Led a team of four' so it fits recruiters' screens.")).toEqual([]);
    expect(suggestedWordings("Write 'Led a team of four ' and check employers' names.")).toEqual([]);
  });

  it("starting at an apostrophe in the fix's own prose", () => {
    expect(suggestedWordings("Shorten your jobs from the '90s to one line each, for example 'Sales Assistant, Tesco, Leeds, 1996–1999'.")).toEqual([
      "Sales Assistant, Tesco, Leeds, 1996–1999",
    ]);
    expect(suggestedWordings(`Shorten the '90s jobs: change "Sales Assistant at Tesco from 1996 to 1999" to 'Sales Assistant, Tesco, 1996–1999'.`)).toEqual([
      "Sales Assistant, Tesco, 1996–1999",
    ]);
    // Missed, because "not" comes earlier in the sentence: allowed, since nothing wrong is offered.
    expect(suggestedWordings("Give months as well as years ('19–'22 is not enough): write 'March 2019 – June 2022'.")).toEqual([]);
  });

  it("merging two suggestions, or taking in the CV's own words", () => {
    expect(
      suggestedWordings(`Change "Employee of the month" to 'Named "Employee of the Month"' and "Did sales" to 'Grew sales by 10% in 2023'.`),
    ).toEqual([]);
    expect(suggestedWordings("Write 'Won \"Star Seller\"' or 'Led a team of four'.")).toEqual([]);
    expect(suggestedWordings("Change 'Responsible for sales' to 'Grew sales by 10% in a year'.")).toEqual(["Grew sales by 10% in a year"]);
    expect(suggestedWordings("Swap 'Responsible for the rota' for 'Planned the weekly staff rota'.")).toEqual(["Planned the weekly staff rota"]);
    expect(suggestedWordings(`The line "Handled 'key accounts' daily" is vague.`)).toEqual([]);
    expect(suggestedWordings("The line “Handled 'key accounts' daily\" is vague.")).toEqual([]);
  });

  it("that the fix says not to write", () => {
    expect(suggestedWordings("Don't add 'Power BI' or 'Advanced Excel' unless you used them.")).toEqual([]);
    expect(suggestedWordings("Don't list 'Power BI', 'Tableau dashboards' or 'Python scripting' unless you used them.")).toEqual([]);
    expect(suggestedWordings("Don't just say 'Worked in a team'. Say what the team did.")).toEqual([]);
    expect(suggestedWordings("Don't start lines with 'I was responsible for'; begin with a verb.")).toEqual([]);
    expect(suggestedWordings("Do not use the phrase 'Hard-working team player'.")).toEqual([]);
    expect(suggestedWordings("Avoid clichés such as 'team player' and 'hard-working individual'; show a result instead.")).toEqual([]);
    expect(suggestedWordings("Avoid phrases, e.g. 'Team player with good communication'.")).toEqual([]);
    expect(suggestedWordings("Remove 'References available on request' and 'Curriculum Vitae' from the CV.")).toEqual([]);
    expect(suggestedWordings("'Hard-working team player' says little.")).toEqual([]);
    expect(suggestedWordings("Change it to 'Analysed sales data in Excel'. Don't add 'Power BI' unless you used it.")).toEqual([
      "Analysed sales data in Excel",
    ]);
  });

  it("of one word, or from a fix with no suggestion", () => {
    expect(suggestedWordings("Add a short 'Skills' section and change \"colors\" to 'colours'.")).toEqual([]);
    expect(suggestedWordings("If you know the figure, add it. Don't guess, and check the Smiths' dates.")).toEqual([]);
    expect(suggestedWordings("Write 'an unclosed quote here")).toEqual([]);
    expect(suggestedWordings("")).toEqual([]);
  });
});
