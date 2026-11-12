// The cover letter never claims the ad's registration or Band for a user who gave neither (#424), and may still name the job.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withoutRoleClaims } from "@/features/tailor";
import { letterRoleClaim } from "@/features/tailor/nothing-invented";
import { createCoverLetter } from "@/features/tailor/actions";
import { clinicalFixtures, unregisteredFixtures } from "./clinical-fixture";

const { writeCoverLetter, data } = vi.hoisted(() => ({ writeCoverLetter: vi.fn(), data: { fixtures: null as unknown } }));
vi.mock("@/features/tailor/cover-letter", async (original) => ({ ...(await original<typeof import("@/features/tailor/cover-letter")>()), writeCoverLetter }));
vi.mock("@/features/tailor/server/my-data", async (original) => {
  const fixtures = () => data.fixtures as typeof unregisteredFixtures;
  return {
    ...(await original<typeof import("@/features/tailor/server/my-data")>()),
    getMyProfile: async () => fixtures().profile,
    getMyJob: async () => fixtures().job,
    getMyMatch: async () => fixtures().match,
  };
});
vi.mock("@/features/account/current-user", () => ({ getCurrentUser: async () => null }));
vi.mock("@/shared/supabase/server", () => ({ createSupabaseServerClient: async () => null }));
vi.mock("@/shared/analytics/track", () => ({ track: vi.fn() }));
vi.mock("@/shared/ai/anonymous-key", () => ({ getAnonymousKey: async () => ({ anonymousKey: "visitor" }) }));
vi.mock("next/server", () => ({ after: (task: () => Promise<void>) => task() }));

const applying = "I am applying for the Senior Staff Nurse (Band 6) post on the Acute Medical Unit.";
const titleOnly = "This Senior Staff Nurse (Band 6), Acute Medical Unit role is the next step I want.";
const nmc = "As an NMC registered nurse, I coordinate late shifts with the nurse in charge.";
const band = "I have worked as a Band 6 nurse on nights.";
const ivTherapy = "I am confident with IV therapy.";
const letter = (...paragraphs: string[]) => ({ greeting: "Dear Hiring Manager,", paragraphs, signOff: "Yours sincerely," });
const request = { jobId: "clinical-job", changes: [], answers: unregisteredFixtures.answers };

beforeEach(() => {
  vi.clearAllMocks();
  data.fixtures = unregisteredFixtures;
});

describe("a letter that claims the ad's registration or Band (#424)", () => {
  it("loses the NMC and Band 6 sentences for a nurse without them, and keeps the job's name", async () => {
    writeCoverLetter.mockResolvedValue(letter(`${applying} ${titleOnly}`, `${nmc} ${band} ${ivTherapy}`));
    const result = await createCoverLetter(request);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toContain(applying);
    expect(result.text).toContain(titleOnly);
    expect(result.text).toContain(ivTherapy);
    expect(result.text).not.toContain("NMC");
    expect(result.text).not.toContain("Band 6 nurse");
    expect(writeCoverLetter).toHaveBeenCalledTimes(1);
  });

  it("keeps the NMC sentence for Leah, whose CV says NMC registered", async () => {
    data.fixtures = { ...clinicalFixtures, answers: [] };
    writeCoverLetter.mockResolvedValue(letter(applying, nmc));
    const result = await createCoverLetter({ ...request, answers: [] });
    expect(result.ok && result.text).toContain(nmc);
  });

  it("loses the NMC sentence after a student's yes to the registration gap (#464)", async () => {
    const answers = [{ gapId: "clinical-gap-nmc", question: "Do you hold current NMC registration?", answer: "I'm a final-year student nurse and qualify in March.", hasExperience: true }];
    writeCoverLetter.mockResolvedValue(letter(applying, `${nmc} ${ivTherapy}`));
    const result = await createCoverLetter({ ...request, answers });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).not.toContain("NMC");
      expect(result.text).toContain(ivTherapy);
    }
  });

  it("says why when nothing of the letter is left", async () => {
    writeCoverLetter.mockResolvedValue(letter(nmc));
    const result = await createCoverLetter(request);
    expect(result).toEqual({
      ok: false,
      message: "Every sentence in the draft said you hold “NMC”, which your CV and answers do not show. If you do, add it to your profile and write the letter again.",
    });
  });

  it("names what it took out", () => {
    const { profile, job, match, answers } = unregisteredFixtures;
    const checked = withoutRoleClaims(letter(applying, `${nmc} ${band}`), job.title, { profile, gaps: match.gaps, answers, role: job.role });
    expect(checked.claims).toEqual(["NMC", "Band 6"]);
    expect(checked.letter.paragraphs).toEqual([applying]);
  });
});

describe("the letter's check takes out only a claim in the first person (#466)", () => {
  const leah = { ...clinicalFixtures, answers: [] };
  const sourcesOf = (fixtures: typeof unregisteredFixtures, profile = fixtures.profile) => ({ profile, gaps: fixtures.match.gaps, answers: fixtures.answers, role: fixtures.job.role });
  const title = clinicalFixtures.job.title;

  it.each([
    "I am writing to apply for the post of Senior Staff Nurse (Band 6) on the Acute Medical Unit.",
    "This Band 6 role would let me lead shifts.",
    "I have looked after patients on Ward B6 for three years.",
  ])("keeps a true sentence for Leah at Band 5: %s", (sentence) => {
    expect(letterRoleClaim(sentence, title, sourcesOf(leah))).toBeNull();
  });

  it.each(["As a Band 6 nurse, I lead late shifts.", "I acted up into a Band 6 role on nights."])("takes out a Band Leah does not hold: %s", (sentence) => {
    expect(letterRoleClaim(sentence, title, sourcesOf(leah))).toBe("Band 6");
  });

  it("takes the job's title out only where it names the post", () => {
    const role = { ...clinicalFixtures.job.role!, level: "Band 6" };
    const sources = { ...sourcesOf(leah), role };
    expect(letterRoleClaim("I have worked as a Band 6 Staff Nurse on nights.", "Band 6 Staff Nurse", sources)).toBe("Band 6");
    expect(letterRoleClaim("I am applying for the Band 6 Staff Nurse post.", "Band 6 Staff Nurse", sources)).toBeNull();
    const nmc = { ...sourcesOf(unregisteredFixtures), role: { ...role, registration: "NMC" } };
    expect(letterRoleClaim("I am a Registered Nurse (NMC) on an acute ward.", "Registered Nurse (NMC)", nmc)).toBe("NMC");
  });

  it("counts NMC registration in the summary or a degree, but not NMC approved or not yet registered", () => {
    const sentence = "I am NMC registered and confident with IV therapy.";
    const base = unregisteredFixtures.profile;
    const withSummary = { ...base, summary: "NMC registered adult nurse with three years on an acute unit." };
    const withDegree = { ...base, education: [{ ...base.education[0], qualification: "BSc (Hons) Adult Nursing, NMC registration 2022" }] };
    const approved = { ...base, education: [{ ...base.education[0], qualification: "BSc Adult Nursing (NMC approved)" }] };
    const notYet = { ...base, summary: "Adult nurse, not yet NMC registered." };
    const check = (profile: typeof base) => letterRoleClaim(sentence, title, { ...sourcesOf(unregisteredFixtures, profile), answers: [] });
    expect(check(withSummary)).toBeNull();
    expect(check(withDegree)).toBeNull();
    expect(check(approved)).toBe("NMC");
    expect(check(notYet)).toBe("NMC");
  });

  it("tells the user what it took out, and says nothing when nothing was", async () => {
    writeCoverLetter.mockResolvedValue(letter(`${applying} ${nmc}`, ivTherapy));
    const result = await createCoverLetter(request);
    expect(result).toMatchObject({
      ok: true,
      note: "We took out 1 sentence saying you hold “NMC”, which your CV and answers do not show. If you do, add it to your profile and write the letter again.",
    });
    writeCoverLetter.mockResolvedValue(letter(applying, ivTherapy));
    expect(await createCoverLetter(request)).not.toHaveProperty("note");
  });
});

describe("the letter after an answer or a line that says the user is not registered now (#483)", () => {
  const nmcGap = "clinical-gap-nmc";

  it("takes out the NMC sentence, with a note, after a yes that says not yet", async () => {
    const answers = [{ gapId: nmcGap, question: "Do you hold current NMC registration?", answer: "I'm not NMC registered yet, I qualify in March.", hasExperience: true }];
    writeCoverLetter.mockResolvedValue(letter(applying, `${nmc} ${ivTherapy}`));
    const result = await createCoverLetter({ ...request, answers });
    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.text).not.toContain("NMC registered");
      expect(result.note).toContain("“NMC”");
    }
  });

  it("takes out the NMC sentence after No, not yet, with a pre-registration summary", async () => {
    data.fixtures = { ...unregisteredFixtures, profile: { ...unregisteredFixtures.profile, summary: "Final-year pre-registration student nurse on an NMC-approved programme." } };
    writeCoverLetter.mockResolvedValue(letter(applying, `${nmc} ${ivTherapy}`));
    const result = await createCoverLetter(request);
    expect(result.ok && result.text).not.toContain("NMC registered");
  });

  it.each([
    "Healthcare assistant working alongside NMC registered nurses on a busy acute ward.",
    "Final-year pre-registration student nurse on an NMC-approved programme.",
    "Final-year adult nursing student, eligible for NMC registration in September 2027.",
    "Student nurse with NMC registration from September 2027.",
    "Return to practice nurse; my NMC registration lapsed in 2019.",
  ])("finds the NMC claim in a letter for a summary of %s", (summary) => {
    const { job, match, answers } = unregisteredFixtures;
    const profile = { ...unregisteredFixtures.profile, summary };
    expect(letterRoleClaim("As an NMC registered nurse, I give IV therapy.", job.title, { profile, gaps: match.gaps, answers, role: job.role })).toBe("NMC");
  });
});
