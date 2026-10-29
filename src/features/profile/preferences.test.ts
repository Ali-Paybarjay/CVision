import { describe, expect, it } from "vitest";
import { JobPreferencesSchema, type JobPreferences } from "@/shared/contracts";
import { personas } from "@/shared/sample-data";
import {
  describePreferences,
  draftFromPreferences,
  MAX_NOTES_CHARACTERS,
  noteLines,
  preferencesFromDraft,
  readPounds,
  type PreferencesDraft,
} from "./preferences";

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

describe("must-haves and deal-breakers", () => {
  const withNotes = (notes: string) => preferencesFromDraft({ ...draftFromPreferences(empty), notes });

  it("keeps one per line, trimmed, without blank lines", () => {
    const result = withNotes("  Move into team leadership \r\n\n No night shifts\n  \nNot in gambling\n");

    expect(result.ok && result.preferences.notes).toBe("Move into team leadership\nNo night shifts\nNot in gambling");
  });

  it("gives saved notes back unchanged", () => {
    const preferences: JobPreferences = { ...empty, notes: "No night shifts\nWithin 45 minutes of Leeds" };

    expect(preferencesFromDraft(draftFromPreferences(preferences))).toEqual({ ok: true, preferences });
  });

  it("leaves them out when nothing is written", () => {
    const result = withNotes(" \n \n");

    expect(result.ok && "notes" in result.preferences).toBe(false);
  });

  it("asks for a shorter note, counting what is saved", () => {
    expect(withNotes("a".repeat(MAX_NOTES_CHARACTERS + 1))).toEqual({
      ok: false,
      errors: { notes: "Keep this to 500 characters or fewer." },
    });
    expect(withNotes(` ${"a".repeat(MAX_NOTES_CHARACTERS)} \n\n`)).toMatchObject({ ok: true });
  });

  it("has the same limit as the contract", () => {
    expect(JobPreferencesSchema.safeParse({ ...empty, notes: "a".repeat(MAX_NOTES_CHARACTERS) }).success).toBe(true);
    expect(JobPreferencesSchema.safeParse({ ...empty, notes: "a".repeat(MAX_NOTES_CHARACTERS + 1) }).success).toBe(false);
  });

  it("reads saved notes as lines, and nothing as no lines", () => {
    expect(noteLines("No night shifts\nNot in gambling")).toEqual(["No night shifts", "Not in gambling"]);
    expect(noteLines(undefined)).toEqual([]);
  });

  it("are not part of the plain preference lines", () => {
    expect(describePreferences({ ...empty, notes: "No night shifts" })).toEqual([]);
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
