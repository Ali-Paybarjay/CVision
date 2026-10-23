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
