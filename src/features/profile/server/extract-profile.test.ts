import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { describe, expect, it } from "vitest";
import { ProfileSchema } from "@/shared/contracts";
import { personas } from "@/shared/sample-data";
import { CvExtractionSchema, extractionFromProfile, tidyExtraction } from "../cv-extraction";
import { extractProfile, samplePersonaFor } from "./extract-profile";

describe("extractProfile in mock mode", () => {
  it("answers with the sample persona named in the CV", async () => {
    const profile = await extractProfile("REZA KARIMI\nLondon | reza.karimi@example.com\nMaths Teacher and Head of Year 9");

    expect(profile.fullName).toBe("Reza Karimi");
    expect(profile.experience.map((job) => job.company)).toEqual(personas.reza.profile.experience.map((job) => job.company));
  });

  it("gives back the sample profile's details unchanged, for the review step", async () => {
    const details = await extractProfile("Daniel Brooks, Store Manager");

    expect(details).toEqual(extractionFromProfile(personas.daniel.profile));
  });
});

describe("tidyExtraction (#33)", () => {
  const base = extractionFromProfile(personas.sara.profile);

  it("keeps what the CV doesn't give empty, instead of failing", () => {
    const details = CvExtractionSchema.parse({
      ...base,
      fullName: "   ",
      experience: [{ ...base.experience[0], company: "", startDate: "", endDate: "", current: false }],
      education: [{ ...base.education[0], startDate: "", endDate: "" }],
    });

    const tidy = tidyExtraction(details);

    expect(tidy.fullName).toBe("");
    expect(tidy.experience[0]).toMatchObject({ company: "", startDate: "", endDate: "" });
  });

  it("drops the end date of a job the user still has, and empty or repeated lines", () => {
    const tidy = tidyExtraction({
      ...base,
      skills: [" SQL ", "sql", "", "Python"],
      experience: [{ ...base.experience[0], endDate: "2026-01", current: true, duties: ["Built dashboards", " ", "built dashboards"] }],
    });

    expect(tidy.skills).toEqual(["SQL", "Python"]);
    expect(tidy.experience[0]).toMatchObject({ endDate: "", current: true, duties: ["Built dashboards"] });
  });

  it("keeps a certificate with an issuer but no name for the user to complete, and drops an empty one", () => {
    const tidy = tidyExtraction({ ...base, certifications: [{ name: " ", issuer: "BCS" }, { name: "" }] });

    expect(tidy.certifications).toEqual([{ name: "", issuer: "BCS", year: undefined }]);
  });

  it("keeps a language only with its name, and its level only when the CV gives one (#227)", () => {
    const tidy = tidyExtraction({
      ...base,
      languages: [{ name: " French ", level: " B1 " }, { name: "British Sign Language", level: " " }, { name: "", level: "Fluent" }],
    });

    expect(tidy.languages).toEqual([
      { name: "French", level: "B1" },
      { name: "British Sign Language", level: undefined },
    ]);
  });

  it("keeps a project or a volunteering role the CV says anything about, for the user to complete, and drops empty ones", () => {
    const noDates = { startDate: "", endDate: "", current: false };
    const tidy = tidyExtraction({
      ...base,
      projects: [
        { name: " Late buses dashboard ", startDate: "2025-01", endDate: "2025-05", current: true, details: ["Built it", "built it", " "], url: " " },
        { name: " ", ...noDates, details: [" "] },
        { name: "", ...noDates, details: [], url: "https://example.com/sara/late-buses" },
      ],
      volunteering: [
        { role: "", organisation: "Ancoats Reading Club", ...noDates, details: [] },
        { role: " ", organisation: " ", ...noDates, details: [] },
      ],
    });

    expect(tidy.projects).toEqual([
      { name: "Late buses dashboard", startDate: "2025-01", endDate: "", current: true, details: ["Built it"], url: undefined },
      { name: "", ...noDates, details: [], url: "https://example.com/sara/late-buses" },
    ]);
    expect(tidy.volunteering).toEqual([{ role: "", organisation: "Ancoats Reading Club", ...noDates, details: [] }]);
  });

  it("keeps a role the CV lists among its jobs as a job only, never in both lists", () => {
    const dates = { startDate: "2024-01", endDate: "", current: true };
    const job = { ...base.experience[0], title: "Volunteer maths tutor", company: "Ancoats Reading Club", ...dates };
    const tidy = tidyExtraction({
      ...base,
      experience: [job],
      volunteering: [
        { role: " volunteer maths tutor ", organisation: "ANCOATS READING CLUB", ...dates, details: [] },
        { role: "Charity shop assistant", startDate: "", endDate: "", current: false, details: [] },
      ],
    });

    expect(tidy.experience.map((item) => item.title)).toEqual(["Volunteer maths tutor"]);
    expect(tidy.volunteering.map((role) => role.role)).toEqual(["Charity shop assistant"]);
  });

  it("keeps a separate period at the same organisation, and roles with no organisation, as volunteering (#253 review)", () => {
    const tidy = tidyExtraction({
      ...base,
      experience: [
        { ...base.experience[0], title: "Shop assistant", company: "Oxfam", startDate: "2023-03", endDate: "", current: true },
        { ...base.experience[0], title: "Football coach", company: "", startDate: "2022-09", endDate: "", current: true },
      ],
      volunteering: [
        { role: "Shop assistant", organisation: "Oxfam", startDate: "2021-01", endDate: "2022-06", current: false, details: ["Sorted donations every Saturday"] },
        { role: "Football coach", startDate: "2022-09", endDate: "", current: true, details: [] },
      ],
    });

    expect(tidy.volunteering).toEqual([
      { role: "Shop assistant", organisation: "Oxfam", startDate: "2021-01", endDate: "2022-06", current: false, details: ["Sorted donations every Saturday"] },
      { role: "Football coach", startDate: "2022-09", endDate: "", current: true, details: [] },
    ]);
  });

  it("never needs a guess from the model: every sample profile fits the loose format", () => {
    for (const persona of Object.values(personas)) {
      expect(() => CvExtractionSchema.parse(extractionFromProfile(persona.profile))).not.toThrow();
    }
    expect(() => ProfileSchema.parse(personas.sara.profile)).not.toThrow();
  });
});

describe("samplePersonaFor", () => {
  it("finds the persona by full name, in any case", () => {
    expect(samplePersonaFor("cv of emma walsh")).toBe("emma");
    expect(samplePersonaFor("Daniel Brooks")).toBe("daniel");
  });

  it("falls back to Sara when no persona is named", () => {
    expect(samplePersonaFor("Someone Else")).toBe("sara");
  });
});

describe("the model's answer formats", () => {
  it("CvExtractionSchema converts to a structured output format", () => {
    expect(() => zodOutputFormat(CvExtractionSchema)).not.toThrow();
  });
});
