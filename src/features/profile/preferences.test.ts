import { describe, expect, it } from "vitest";
import type { JobPreferences } from "@/shared/contracts";
import { personas } from "@/shared/sample-data";
import { describePreferences, draftFromPreferences, preferencesFromDraft, readPounds, type PreferencesDraft } from "./preferences";

const empty: JobPreferences = { salary: null, location: "", workModes: [], contractTypes: [], hours: [] };

describe("job preferences", () => {
  it.each(Object.keys(personas) as (keyof typeof personas)[])("gives %s's preferences back unchanged", (name) => {
    const preferences = personas[name].profile.preferences;
    const result = preferencesFromDraft(draftFromPreferences(preferences));

    expect(result.ok && result.preferences).toEqual(preferences);
  });

  it("tidies the location and drops repeated choices", () => {
    const draft: PreferencesDraft = {
      ...draftFromPreferences(empty),
      location: "  Leeds ",
      workModes: ["remote", "hybrid", "remote"],
      hours: ["part-time", "full-time"],
    };

    const result = preferencesFromDraft(draft);

    expect(result.ok && result.preferences).toMatchObject({ location: "Leeds", workModes: ["remote", "hybrid"], hours: ["part-time", "full-time"] });
  });

  it("reads the lowest pay in the usual ways, and asks again for anything else", () => {
    const draft = { ...draftFromPreferences(empty), minimumPay: "£30k", payPeriod: "year" as const };
    expect(preferencesFromDraft(draft)).toMatchObject({ ok: true, preferences: { salary: { min: 30000, period: "year" } } });
    expect(preferencesFromDraft({ ...draft, minimumPay: "", maximumPay: "35,000" })).toMatchObject({
      ok: true,
      preferences: { salary: { max: 35000 } },
    });
    expect(preferencesFromDraft({ ...draft, maximumPay: "20000" })).toEqual({
      ok: false,
      errors: { maximumPay: "This is less than the lowest pay." },
    });

    expect(preferencesFromDraft({ ...draft, minimumPay: "lots" })).toEqual({
      ok: false,
      errors: { minimumPay: "Enter an amount in pounds, for example 30000." },
    });
    expect(preferencesFromDraft({ ...draft, minimumPay: " " })).toMatchObject({ ok: true, preferences: { salary: null } });
  });
});

describe("readPounds", () => {
  it.each([
    ["30000", 30000],
    ["£30,000", 30000],
    ["30k", 30000],
    ["£ 12.50", 12.5],
    ["450", 450],
  ])("reads %j as %d", (text, amount) => {
    expect(readPounds(text)).toBe(amount);
  });

  it.each(["", "0", "-5", "30,00", "about 30k", "2000000"])("refuses %j", (text) => {
    expect(readPounds(text)).toBeNull();
  });
});

describe("describePreferences", () => {
  it("lists what is set, in plain words", () => {
    const lines = describePreferences({
      salary: { min: 30000, currency: "GBP", period: "year", isEstimate: false },
      location: "Manchester",
      workModes: ["hybrid", "remote"],
      contractTypes: ["permanent"],
      hours: ["full-time"],
    });

    expect(lines).toEqual(["Manchester", "Remote or Hybrid", "Permanent", "Full-time", "At least £30,000 a year"]);
  });

  it("shows a pay range when there is one", () => {
    expect(describePreferences(personas.sara.profile.preferences)).toContain("£28,000 to £32,000 a year");
  });

  it("is empty when nothing is set", () => {
    expect(describePreferences(empty)).toEqual([]);
  });
});
