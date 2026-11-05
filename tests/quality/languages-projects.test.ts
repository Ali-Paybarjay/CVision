// The checks behind languages-projects.eval.ts, with no model: each must catch a made-up line and let an honest one through.
import { describe, expect, it } from "vitest";
import { coverLetterText, writeCoverLetter } from "@/features/tailor";
import { claimsLevel, input, numbersNotInSources, overstatedLevels, wordsNotOnCv } from "./languages-projects.cases";

describe("the languages and projects case", () => {
  it("has both sections, and nothing the eval forbids is on her CV", () => {
    const { profile } = input;
    expect(profile.languages?.length).toBeGreaterThan(0);
    expect(profile.projects?.length).toBeGreaterThan(0);
    expect(wordsNotOnCv(JSON.stringify(profile))).toEqual([]);
  });

  it("tells the model what she said no to", () => {
    expect(input.declined).toEqual(["Accessibility (WCAG)", "Welsh speaker"]);
  });

  it("passes every check with the mock letter", async () => {
    const text = coverLetterText(await writeCoverLetter(input), input.profile.fullName);
    expect(wordsNotOnCv(text)).toEqual([]);
    expect(numbersNotInSources(text)).toEqual([]);
    expect(overstatedLevels(text)).toEqual([]);
  });
});

describe("overstatedLevels", () => {
  it.each(["I am fluent in Spanish.", "I speak fluent Spanish.", "My Spanish is C1.", "I hold British Sign Language Level 3.", "I use BSL fluently."])(
    "catches %s",
    (sentence) => {
      expect(overstatedLevels(sentence)).toEqual([sentence]);
    },
  );

  it.each([
    "I speak Spanish at B2.",
    "I also have British Sign Language.",
    "You ask for fluent Spanish.",
    "Your advert asks for British Sign Language Level 3, and I have British Sign Language.",
    "I am fluent in React.",
  ])("lets through %s", (sentence) => {
    expect(overstatedLevels(sentence)).toEqual([]);
  });
});

describe("claimsLevel on a CV line, which has no I", () => {
  it("catches a level she does not have and lets her own through", () => {
    expect(claimsLevel("Fluent Spanish")).toBe(true);
    expect(claimsLevel("British Sign Language Level 3")).toBe(true);
    expect(claimsLevel("Spanish (B2)")).toBe(false);
    expect(claimsLevel("British Sign Language")).toBe(false);
  });
});

describe("numbersNotInSources", () => {
  it("catches a number that is nowhere in her CV, her answers or the ad", () => {
    expect(numbersNotInSources("My Recipe finder app is used by 500 people.")).toEqual(["500"]);
  });

  it("knows her numbers, in digits or words, and does not read B2 as a number", () => {
    expect(numbersNotInSources("I reduced abandoned bookings by 18%. I gave a 10-minute talk. I speak Spanish at B2.")).toEqual([]);
  });
});

describe("wordsNotOnCv", () => {
  it("catches what she said no to, a tool she did not name and a bigger talk", () => {
    expect(wordsNotOnCv("I speak Welsh, test with Jest and gave a conference talk.")).toEqual(["welsh", "jest", "conference"]);
  });

  it("lets her real project through", () => {
    expect(wordsNotOnCv("I wrote tests for every component with Vitest and gave a talk on labelling form fields.")).toEqual([]);
  });
});
