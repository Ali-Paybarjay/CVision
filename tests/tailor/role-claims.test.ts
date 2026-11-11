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

describe("the holes the rule 14 review found in the Band and NMC check (#432)", () => {
  const leah = clinicalFixtures;
  const unregistered = unregisteredFixtures;
  const leahSources = { profile: leah.profile, gaps: leah.match.gaps, answers: [], role };
  const unregisteredSources = { profile: unregistered.profile, gaps: unregistered.match.gaps, answers: unregistered.answers, role };
  const withDuty = (profile: typeof leah.profile, duty: string) => ({
    ...profile,
    experience: profile.experience.map((job, index) => (index === 0 ? { ...job, duties: [...job.duties, duty] } : job)),
  });
  const nmcLine = fromCv(lateShifts, "Registered Nurse (Adult), NMC registered, coordinating late shifts with the nurse in charge");

  describe("still rejected", () => {
    it("a Band 6 in a summary rewrite, when the old summary only wished for one", () => {
      expect(roleClaimAdded(fromCv(leah.profile.summary, "Senior Staff Nurse (Band 6) with three years on an acute medical unit"), leahSources)).toBe("Band 6");
    });

    it("NMC in a summary rewrite, when the old summary was only due to join the register", () => {
      const before = "Adult nurse due to join the NMC register, with three years on an acute medical unit";
      expect(roleClaimAdded(fromCv(before, "NMC-registered adult nurse with three years on an acute medical unit"), unregisteredSources)).toBe("NMC");
    });

    it.each(["Acted up into a Band 6 role on night shifts", "Promoted to a Band 6 post in 2024"])("a Band held, not wanted: %s", (after) => {
      expect(roleClaimAdded({ ...plain, after }, leahSources)).toBe("Band 6");
    });

    it.each(["B6 nurse leading late shifts", "Band six nurse leading late shifts", "Band-6 nurse leading late shifts", "Band6 nurse leading late shifts"])(
      "another spelling of Band 6: %s",
      (after) => expect(roleClaimAdded({ ...plain, after }, leahSources)).toBe("Band 6"),
    );

    it("RGN, which is NMC registration", () => {
      expect(roleClaimAdded({ ...plain, after: "RGN coordinating late shifts" }, unregisteredSources)).toBe("NMC");
    });

    it("Band 6 under a role of Band 5/6, and NMC under a role of NMC (Adult)", () => {
      const sources = { ...leahSources, role: { ...role, level: "Band 5/6" } };
      expect(roleClaimAdded({ ...plain, after: "Band 6 nurse leading late shifts" }, sources)).toBe("Band 6");
      expect(roleClaimAdded(nmcClaim, { ...unregisteredSources, role: { ...role, registration: "NMC (Adult)" } })).toBe("NMC");
    });

    it("a Band from a duty about someone else, on another line", () => {
      const profile = withDuty(leah.profile, "Support the Band 6 nurse in charge with handover");
      expect(roleClaimAdded(band6Claim, { ...leahSources, profile })).toBe("Band 6");
    });

    it("NMC from a duty about other nurses, after \"No, not yet.\"", () => {
      const profile = withDuty(unregistered.profile, "Worked alongside NMC registered nurses on the ward");
      expect(roleClaimAdded(nmcClaim, { ...unregisteredSources, profile })).toBe("NMC");
    });

    it("Band 6 with a title on Ward B6, which names the ward", () => {
      const profile = { ...leah.profile, experience: [{ ...leah.profile.experience[0], title: "Staff Nurse (Band 5), Ward B6" }] };
      expect(roleClaimAdded(band6Claim, { ...leahSources, profile })).toBe("Band 6");
    });

    it("NMC after a yes to \"Knowledge of the NMC Code\", which is not registration", () => {
      const gap = { id: "nmc-code", requirement: "Knowledge of the NMC Code", importance: "essential" as const, kind: "missing" as const, detail: "" };
      const answers = [{ gapId: gap.id, question: "", answer: "Yes", hasExperience: true }];
      expect(roleClaimAdded(nmcClaim, { profile: unregistered.profile, gaps: [gap], answers, role })).toBe("NMC");
    });
    it("an NMC line after a bare \"Yes\" to the NMC gap: a yes counts only by its own words (#464)", () => {
      const sources = { profile: unregistered.profile, gaps: unregistered.match.gaps, role };
      for (const hasExperience of [true, false]) {
        expect(roleClaimAdded(nmcLine, { ...sources, answers: [{ gapId: "clinical-gap-nmc", question: "", answer: "Yes", hasExperience }] })).toBe("NMC");
      }
    });
  });

  describe("kept", () => {
    it.each(["NMC", "Nursing and Midwifery Council"])("an NMC line with a certificate issued by %s", (issuer) => {
      const profile = { ...unregistered.profile, certifications: [{ name: "Registered Nurse (Adult)", issuer }] };
      expect(roleClaimAdded(fromCv(lateShifts, "NMC-registered adult nurse coordinating late shifts"), { ...unregisteredSources, profile })).toBeNull();
    });

    it("an NMC line when NMC is only in the skills", () => {
      const profile = { ...unregistered.profile, skills: [...unregistered.profile.skills, "NMC registered"] };
      expect(roleClaimAdded(nmcClaim, { ...unregisteredSources, profile })).toBeNull();
    });

    it("a summary rewrite whose old summary says NMC registered", () => {
      const before = "NMC registered adult nurse with three years on an acute medical unit";
      expect(roleClaimAdded(fromCv(before, "NMC-registered adult nurse with three years in acute medicine"), unregisteredSources)).toBeNull();
    });

    it("Leah's Band 5 under a role of Band 5/6", () => {
      const sources = { ...leahSources, role: { ...role, level: "Band 5/6" } };
      expect(roleClaimAdded({ ...plain, after: "Band 5 staff nurse leading late shifts" }, sources)).toBeNull();
    });
  });
});

describe("a yes counts only by its own words, and wishes, other people and spellings are read right (#464)", () => {
  const leah = clinicalFixtures;
  const nmcLine = fromCv(lateShifts, "Registered Nurse (Adult), NMC registered, coordinating late shifts with the nurse in charge");
  const unregistered = unregisteredFixtures;
  const gap = (id: string, requirement: string) => ({ id, requirement, importance: "essential" as const, kind: "missing" as const, detail: "" });
  const yes = (gapId: string, answer: string) => [{ gapId, question: "", answer, hasExperience: true }];
  const nmcSources = (requirement: string, answer: string) => {
    const asked = gap("asked", requirement);
    return { profile: unregistered.profile, gaps: [asked], answers: yes(asked.id, answer), role };
  };

  describe("rejected", () => {
    it("NMC after a due-to-qualify answer to \"Current NMC registration, or due to qualify within six months\"", () => {
      expect(roleClaimAdded(nmcClaim, nmcSources("Current NMC registration, or due to qualify within six months", "I'm a final-year student nurse and qualify in March."))).toBe("NMC");
    });

    it("NMC after a chosen Band 5 option to \"NMC registered nurse with post-registration experience at Band 5\"", () => {
      expect(roleClaimAdded(nmcClaim, nmcSources("NMC registered nurse with post-registration experience at Band 5", "I completed my BSc in Adult Nursing in 2022."))).toBe("NMC");
    });

    it("Band 6 after Leah's acting-up answer to \"Previous Band 6 experience or experience of acting up\"", () => {
      const asked = gap("asked", "Previous Band 6 experience or experience of acting up");
      const sources = { profile: leah.profile, gaps: [asked], answers: yes(asked.id, "I acted up as nurse in charge on nights."), role };
      expect(roleClaimAdded(band6Claim, sources)).toBe("Band 6");
    });

    it("HCPC after a GBC answer to \"HCPC registration as a Practitioner Psychologist, or eligibility for GBC with the BPS\"", () => {
      const asked = gap("asked", "HCPC registration as a Practitioner Psychologist, or eligibility for GBC with the BPS");
      const sources = { profile: unregistered.profile, gaps: [asked], answers: yes(asked.id, "I am eligible for GBC with the BPS."), role: { ...role, registration: "HCPC" } };
      expect(roleClaimAdded(fromCv(lateShifts, "HCPC registered practitioner coordinating late shifts"), sources)).toBe("HCPC");
    });

    it("NMC rewritten from a line about other nurses", () => {
      expect(roleClaimAdded(fromCv("Worked alongside NMC registered nurses on the ward", "NMC registered nurse on the ward"), { ...nmcSources("x", "x"), answers: [] })).toBe("NMC");
    });

    it("Band 6 rewritten from a line about the nurse in charge", () => {
      const sources = { profile: leah.profile, gaps: [], answers: [], role };
      expect(roleClaimAdded(fromCv("Support the Band 6 nurse in charge with handover", "As a Band 6 nurse, led handover"), sources)).toBe("Band 6");
    });

    it.each(["Seeking Band 6 roles", "NMC registration pending"])("a wish is no support: %s", (wish) => {
      const profile = { ...unregistered.profile, followUpAnswers: [{ id: "f1", question: "Anything else?", answer: wish, answeredAt: "2026-11-01T10:00:00.000Z" }] };
      expect(roleClaimAdded(wish.startsWith("NMC") ? nmcClaim : band6Claim, { profile, gaps: [], answers: [], role })).toBe(wish.startsWith("NMC") ? "NMC" : "Band 6");
    });

    it.each(["Band 5-6", "Bands 5 and 6", "Band 5 to 6", "Band 5 or 6"])("Band 6 under a role of %s", (level) => {
      expect(roleClaimAdded(band6Claim, { profile: leah.profile, gaps: [], answers: [], role: { ...role, level } })).toBe("Band 6");
    });

    it("Band 6 acted up into, in a duty", () => {
      const profile = { ...leah.profile, experience: [{ ...leah.profile.experience[0], duties: ["Acted up into a Band 6 role on nights"] }] };
      expect(roleClaimAdded(band6Claim, { profile, gaps: [], answers: [], role })).toBe("Band 6");
    });

    it("Band 6 from Ward B6 in the line it rewrites", () => {
      const sources = { profile: leah.profile, gaps: [], answers: [], role };
      expect(roleClaimAdded(fromCv("Cared for patients on Ward B6", "As a Band 6 nurse, cared for patients on Ward B6"), sources)).toBe("Band 6");
    });
  });

  describe("kept", () => {
    it("a summary rewrite that keeps the wish to progress to a Band 6 role", () => {
      const after = "Adult nurse with three years in acute medicine, keen to progress to a Band 6 role";
      expect(roleClaimAdded(fromCv(leah.profile.summary, after), { profile: leah.profile, gaps: [], answers: [], role })).toBeNull();
    });

    it("an NMC line when the yes itself says NMC registered", () => {
      expect(roleClaimAdded(nmcLine, nmcSources("Current NMC registration", "Yes, I have been NMC registered since 2021."))).toBeNull();
    });

    it("an NMC line with a certificate issued by the Nursing & Midwifery Council", () => {
      const profile = { ...unregistered.profile, certifications: [{ name: "Registered Nurse (Adult)", issuer: "Nursing & Midwifery Council" }] };
      expect(roleClaimAdded(nmcClaim, { profile, gaps: [], answers: [], role })).toBeNull();
    });

    it.each([
      ["Promoted to Band 6 in 2024", "achievements"],
      ["Appointed as a Band 6 sister in 2024", "duties"],
    ])("a Band 6 the CV says they were given: %s", (line, field) => {
      const profile = { ...leah.profile, experience: [{ ...leah.profile.experience[0], [field]: [line] }] };
      expect(roleClaimAdded(band6Claim, { profile, gaps: [], answers: [], role })).toBeNull();
    });

    it("a Band 6 in a title as (B6), and a Ward B6 in a suggestion that claims no Band", () => {
      const profile = { ...leah.profile, experience: [{ ...leah.profile.experience[0], title: "Senior Staff Nurse (B6)" }] };
      expect(roleClaimAdded(band6Claim, { profile, gaps: [], answers: [], role })).toBeNull();
      expect(roleClaimAdded(fromCv(lateShifts, "Coordinated late shifts on Ward B6"), { profile: leah.profile, gaps: [], answers: [], role })).toBeNull();
    });
  });
});
