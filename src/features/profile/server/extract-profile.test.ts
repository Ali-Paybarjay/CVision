import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { describe, expect, it } from "vitest";
import { ProfileSchema } from "@/shared/contracts";
import { personas } from "@/shared/sample-data";
import { CvExtractionSchema } from "../cv-extraction";
import { FollowUpQuestionListSchema } from "../follow-up";
import { extractProfile, samplePersonaFor } from "./extract-profile";

describe("extractProfile in mock mode", () => {
  it("answers with the sample persona named in the CV", async () => {
    const profile = await extractProfile("REZA KARIMI\nLondon | reza.karimi@example.com\nMaths Teacher and Head of Year 9");

    expect(profile.fullName).toBe("Reza Karimi");
    expect(profile.experience.map((job) => job.company)).toEqual(personas.reza.profile.experience.map((job) => job.company));
  });

  it("returns a full Profile with a fresh id, empty preferences and no answers yet", async () => {
    const profile = await extractProfile("Daniel Brooks, Store Manager");

    expect(() => ProfileSchema.parse(profile)).not.toThrow();
    expect(profile.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(profile.preferences).toEqual({
      salary: null,
      location: "Birmingham",
      workModes: [],
      contractTypes: [],
      hours: [],
    });
    expect(profile.followUpAnswers).toEqual([]);
  });

  it("gives each CV its own id", async () => {
    const [first, second] = await Promise.all([extractProfile("Emma Walsh"), extractProfile("Emma Walsh")]);
    expect(first.id).not.toBe(second.id);
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
  it.each([
    ["CvExtractionSchema", CvExtractionSchema],
    ["FollowUpQuestionListSchema", FollowUpQuestionListSchema],
  ])("%s converts to a structured output format", (_, schema) => {
    expect(() => zodOutputFormat(schema)).not.toThrow();
  });
});
