// The cover letter never claims the ad's registration or Band for a user who gave neither (#424), and may still name the job.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withoutRoleClaims } from "@/features/tailor";
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

  it("says why when nothing of the letter is left", async () => {
    writeCoverLetter.mockResolvedValue(letter(nmc));
    const result = await createCoverLetter(request);
    expect(result).toEqual({ ok: false, message: "The draft kept saying you hold “NMC”, which only the job ad says, so we did not use it. Try again." });
  });

  it("names what it took out", () => {
    const { profile, job, match, answers } = unregisteredFixtures;
    const checked = withoutRoleClaims(letter(applying, `${nmc} ${band}`), job.title, { profile, gaps: match.gaps, answers, role: job.role });
    expect(checked.claims).toEqual(["NMC", "Band 6"]);
    expect(checked.letter.paragraphs).toEqual([applying]);
  });
});
