// The checks behind languages-projects.eval.ts, with no model: each must catch a made-up line and let an honest one through.
import { describe, expect, it } from "vitest";
import { coverLetterText, writeCoverLetter } from "@/features/tailor";
import { claimsHerSpanish, claimsLevel, input, namesHerProject, numbersNotInSources, overstatedLevels, wordsNotOnCv } from "./languages-projects.cases";

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

  it("gives the project and the Spanish level only through those two sections, so naming them shows the model read them", () => {
    const { job, answers, profile } = input;
    expect(JSON.stringify([job, answers, { ...profile, projects: undefined }])).not.toMatch(namesHerProject);
    expect(JSON.stringify([job, answers, { ...profile, languages: undefined }])).not.toMatch(/\bb2\b/i);
  });

  it("passes every check with the mock letter", async () => {
    const text = coverLetterText(await writeCoverLetter(input), input.profile.fullName);
    expect(wordsNotOnCv(text)).toEqual([]);
    expect(numbersNotInSources(text)).toEqual([]);
    expect(overstatedLevels(text)).toEqual([]);
  });
});

describe("claimsHerSpanish", () => {
  it.each(["I speak Spanish at B2.", "My Spanish is B2.", "You ask for spoken Spanish, and I have it at B2."])("accepts %s", (sentence) => {
    expect(sentence).toMatch(claimsHerSpanish);
  });

  it("does not count the ad's own words", () => {
    expect("You ask for spoken Spanish.").not.toMatch(claimsHerSpanish);
  });
});

describe("overstatedLevels", () => {
  it.each([
    "I am fluent in Spanish.",
    "I speak fluent Spanish.",
    "My Spanish is C1.",
    "My Spanish fluency helps.",
    "I am a native Spanish speaker.",
    "I have professional proficiency in Spanish.",
    "I hold British Sign Language Level 3.",
    "I hold British Sign Language Level Three.",
    "I use BSL fluently.",
    "As a fluent Spanish speaker, I can take calls with patients.",
    "With advanced Spanish and BSL, the role suits me.",
    "My fluent Spanish suits your needs.",
  ])("catches %s", (sentence) => {
    expect(overstatedLevels(sentence)).toEqual([sentence]);
  });

  it.each([
    "I speak Spanish at B2.",
    "I also have British Sign Language.",
    "You ask for fluent Spanish.",
    "I see you need British Sign Language Level 3.",
    "I note that you ask for fluent Spanish.",
    "Your advert asks for British Sign Language Level 3, and I have British Sign Language.",
    "I am fluent in React.",
    "I am fluent in English and speak Spanish at B2.",
    "I am proficient in React and speak Spanish at B2.",
    "I speak English (Native), Spanish (B2) and British Sign Language.",
    "I am a native English speaker with Spanish at B2.",
  ])("lets through %s", (sentence) => {
    expect(overstatedLevels(sentence)).toEqual([]);
  });
});

describe("claimsLevel on a CV line, which has no I", () => {
  it("catches a level she does not have and lets her own through", () => {
    expect(claimsLevel("Fluent Spanish")).toBe(true);
    expect(claimsLevel("Fluent sign language")).toBe(true);
    expect(claimsLevel("British Sign Language Level 3")).toBe(true);
    expect(claimsLevel("Spanish (B2)")).toBe(false);
    expect(claimsLevel("British Sign Language")).toBe(false);
  });
});

describe("numbersNotInSources", () => {
  it("catches a number that is nowhere in her CV, her answers or the ad", () => {
    expect(numbersNotInSources("My Recipe finder app is used by 500 people.")).toEqual(["500"]);
  });

  it("catches a number written as a word", () => {
    expect(numbersNotInSources("I gave a thirty-minute talk to twenty people.")).toEqual(["30", "20"]);
  });

  it("does not take her phone number or the months of her dates as evidence", () => {
    expect(numbersNotInSources("My app has 900303 users.")).toEqual(["900303"]);
    expect(numbersNotInSources("I have 9 years of React.")).toEqual(["9"]);
  });

  it("knows her numbers, in digits or words, and does not read B2 as a number", () => {
    expect(numbersNotInSources("I reduced abandoned bookings by 18%. I gave a 10-minute talk in 2024. I speak Spanish at B2.")).toEqual([]);
    expect(numbersNotInSources("I worked with two senior developers for six agency clients.")).toEqual([]);
  });

  it("does not read one as a number", () => {
    expect(numbersNotInSources("One of my projects is Recipe finder.")).toEqual([]);
  });
});

describe("wordsNotOnCv", () => {
  it("catches what she said no to, what she lacks, a tool she did not name and a bigger talk", () => {
    expect(wordsNotOnCv("I speak Welsh, test with Jest and gave a conference talk.")).toEqual(["welsh", "jest", "conference"]);
    expect(wordsNotOnCv("I have strong accessibility experience.")).toEqual(["accessibility"]);
    expect(wordsNotOnCv("I have built Next.js apps with a design system.")).toEqual(["next.js", "design system"]);
  });

  it("lets her real project and talk through", () => {
    expect(wordsNotOnCv("I wrote tests for every component with Vitest and gave a talk called Accessible forms on labelling form fields.")).toEqual([]);
  });
});
