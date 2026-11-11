// The helper of the tailor-suggest eval (#417), with no model and no network.
import { describe, expect, it } from "vitest";
import { adTermsAdded, suggestCases } from "./suggest-from-cv.cases";

const [leah] = suggestCases;
const news2 = "Record observations and escalate patients with a rising NEWS2 score to the medical team";

describe("adTermsAdded", () => {
  it("finds the ad's duties added to Leah's NEWS2 line", () => {
    const after = `${news2} and critical care outreach, using the trust's sepsis pathway`;
    expect(adTermsAdded({ before: news2, after }, leah.profile, leah.adOnlyTerms)).toEqual(["sepsis", "outreach"]);
  });

  it("lets the ad's word for the same work through", () => {
    const after = "Recorded observations and escalated deteriorating patients to the medical team";
    expect(adTermsAdded({ before: news2, after }, leah.profile, leah.adOnlyTerms)).toEqual([]);
  });

  it("lets a listed word through when the line it rewrites, or the CV, already has it", () => {
    expect(adTermsAdded({ before: "Supported students on placement", after: "Supported nursing students on placement" }, leah.profile, ["student"])).toEqual([]);
    const onCv = { ...leah.profile, skills: [...leah.profile.skills, "Sepsis screening"] };
    expect(adTermsAdded({ before: news2, after: `${news2} and screened for sepsis` }, onCv, ["sepsis"])).toEqual([]);
  });
});
