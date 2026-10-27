import { describe, expect, it } from "vitest";
import { consentPoints, consentPurpose, cvConsent, isManualConsent, manualConsent, manualConsentPoints } from "./consent";

const givenAt = "2026-10-25T09:00:00.000Z";

describe("consent", () => {
  it("keeps the CV's consent and a typed-in profile's consent apart, so a stored one says what it was for", () => {
    expect(manualConsent.version).not.toBe(cvConsent.version);
    expect(consentPurpose({ version: cvConsent.version, givenAt })).toBe("reading your CV");
    expect(consentPurpose({ version: manualConsent.version, givenAt })).toBe("saving the details you typed in");
    // A later wording of the same consent keeps its meaning.
    expect(consentPurpose({ version: "manual-2027-01-01", givenAt })).toBe("saving the details you typed in");
    expect([cvConsent.version, manualConsent.version].map((version) => isManualConsent({ version, givenAt }))).toEqual([false, true]);
  });

  it("names every time a typed-in profile goes to the AI, and promises no more than the Privacy page", () => {
    const [, ai] = manualConsentPoints("account");

    expect(ai).toContain("When you check a job ad, get a tailored CV and cover letter or practise for an interview");
    expect(ai).toContain("delete it once the answer is ready, apart from the few exceptions our Privacy page sets out");
    expect(ai).not.toContain("None of them keeps it");
  });

  it.each(["account", "browser"] as const)("never tells someone with no CV that we read or keep one (%s)", (storage) => {
    const points = manualConsentPoints(storage).join(" ");

    expect(points).not.toMatch(/read your CV|To read|CV file/);
    expect(points).toContain("nothing is saved until you approve it");
    // The advice on what UK CVs leave out, and the link to the Privacy page, are the same as for a CV.
    expect(manualConsentPoints(storage).slice(-2)).toEqual(consentPoints(storage).slice(-2));
  });

  it("says where a typed-in profile is kept", () => {
    expect(manualConsentPoints("account").join(" ")).toContain("we save it to your CVision account");
    expect(manualConsentPoints("browser").join(" ")).toContain("saved in this browser only");
  });

  it("asks for each consent in its own words", () => {
    expect(manualConsent.label).not.toContain(cvConsent.label);
    expect(cvConsent.label).not.toContain(manualConsent.label);
  });
});
