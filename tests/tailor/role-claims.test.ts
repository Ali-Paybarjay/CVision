import { describe, expect, it, vi } from "vitest";
import { enforceNothingInvented, roleClaimAdded, unsupportedReason, type Proposal } from "@/features/tailor";
import type { ProposedChange } from "@/features/tailor/types";
import { clinicalFixtures, unregisteredFixtures } from "./clinical-fixture";

// The model answers with the sample, as mock mode does.
vi.mock("@/shared/ai", async (original) => ({
  ...(await original<typeof import("@/shared/ai")>()),
  askModel: vi.fn(async (options: { sample: unknown }) => options.sample),
}));
const { proposeChanges, suggestFromCv } = await import("@/features/tailor");

const role = clinicalFixtures.job.role!;
const lateShifts = "Support the nurse in charge with bed management on late shifts";
const fromCv = (before: string, after: string): ProposedChange => ({ section: "experience", before, after, evidence: before, evidenceSource: "cv" });
const nmcClaim = fromCv(lateShifts, "As an NMC registered nurse, coordinated late shifts and bed management with the nurse in charge");
const band6Claim = fromCv(
  "Care for up to eight acutely unwell patients on a 32-bed acute medical unit",
  "As a Band 6 nurse, cared for up to eight acutely unwell patients on a 32-bed acute medical unit",
);
const plain = fromCv(lateShifts, "Supported the nurse in charge with bed management and patient flow on late shifts");
const sample = (...changes: ProposedChange[]): Proposal => ({ changes, nextSteps: [] });

describe("a suggestion never claims the ad's registration or Band (#422)", () => {
  it("removes NMC after the user said \"No, not yet.\" to the registration gap", async () => {
    const { profile, job, match, answers } = unregisteredFixtures;
    const proposal = await proposeChanges({ profile, job, match, answers, sample: sample(nmcClaim, plain) });

    expect(proposal.changes.map((change) => change.after)).toEqual([plain.after]);
    expect(proposal.removed?.[0].reason).toMatch(/NMC|not done/);
  });

  it("removes NMC and Band 6 from CV suggestions for a CV that has neither", async () => {
    const { profile, job, match } = unregisteredFixtures;
    const proposal = await suggestFromCv({ profile, job, match, sample: sample(nmcClaim, band6Claim, plain) });

    expect(proposal.changes.map((change) => change.after)).toEqual([plain.after]);
    expect(proposal.removed?.map((item) => item.reason)).toEqual([
      'It adds "NMC", which only the job ad says.',
      'It adds "Band 6", which only the job ad says.',
    ]);
  });

  it("keeps an NMC line for Leah, whose CV says NMC registered, but not a Band 6 she has never held", async () => {
    const { profile, job, match } = clinicalFixtures;
    const proposal = await suggestFromCv({ profile, job, match, sample: sample(nmcClaim, band6Claim) });

    expect(proposal.changes.map((change) => change.after)).toEqual([nmcClaim.after]);
    expect(proposal.removed?.map((item) => item.reason)).toEqual(['It adds "Band 6", which only the job ad says.']);
  });

  it("does not count the summary's wish, and lets a change name the Band as the job wanted", () => {
    const { profile, match } = clinicalFixtures;
    const sources = { profile, gaps: match.gaps, answers: [], role };
    const wish = fromCv(profile.summary, "Adult nurse with three years on an acute medical unit, looking for a Band 6 role in acute medicine");

    expect(roleClaimAdded({ ...wish, before: lateShifts }, sources)).toBeNull();
    expect(roleClaimAdded({ ...plain, after: "Ready for the Senior Staff Nurse (Band 6) post" }, sources)).toBeNull();
    expect(roleClaimAdded({ ...plain, after: "Band 6 nurse leading late shifts" }, sources)).toBe("Band 6");
  });

  it("counts a yes answer as support, and a level without a number is never checked", () => {
    const { profile, match } = unregisteredFixtures;
    const yes = [{ gapId: "clinical-gap-nmc", question: "", answer: "Yes, I joined the NMC register in May.", hasExperience: true }];
    const answerChange: ProposedChange = { ...nmcClaim, evidence: yes[0].answer, evidenceSource: "follow-up-answer" };

    expect(unsupportedReason(answerChange, { profile, gaps: match.gaps, answers: yes, role })).toBeNull();
    expect(roleClaimAdded({ ...plain, after: "Senior nurse on late shifts" }, { profile, gaps: [], answers: [], role: { ...role, level: "Senior", registration: "" } })).toBeNull();
  });

  it("works as before for a job without a role, or with an empty one", () => {
    const { profile } = unregisteredFixtures;
    const empty = { discipline: "", specialty: "", level: "", registration: "" };
    for (const sources of [{ profile, gaps: [], answers: [] }, { profile, gaps: [], answers: [], role: empty }]) {
      expect(enforceNothingInvented([nmcClaim, band6Claim], sources).removed).toEqual([]);
    }
  });
});
