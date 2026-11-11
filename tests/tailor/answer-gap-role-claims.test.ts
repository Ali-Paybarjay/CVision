// A yes to the registration gap that does not say the user is registered keeps no NMC line (#464).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { answerGap } from "@/features/tailor/actions";
import { unregisteredFixtures } from "./clinical-fixture";

const { askModel } = vi.hoisted(() => ({ askModel: vi.fn() }));
vi.mock("@/shared/ai", async (original) => ({ ...(await original<typeof import("@/shared/ai")>()), askModel }));
vi.mock("@/features/tailor/server/my-data", async (original) => ({
  ...(await original<typeof import("@/features/tailor/server/my-data")>()),
  getMyProfile: async () => unregisteredFixtures.profile,
  getMyJob: async () => unregisteredFixtures.job,
  getMyMatch: async () => unregisteredFixtures.match,
}));
vi.mock("@/features/account/current-user", () => ({ getCurrentUser: async () => null }));
vi.mock("@/shared/supabase/server", () => ({ createSupabaseServerClient: async () => null }));
vi.mock("@/shared/analytics/track", () => ({ track: vi.fn() }));
vi.mock("@/shared/ai/anonymous-key", () => ({ getAnonymousKey: async () => ({ anonymousKey: "visitor" }) }));
vi.mock("next/server", () => ({ after: (task: () => Promise<void>) => task() }));

const lateShifts = "Support the nurse in charge with bed management on late shifts";
const gapId = "clinical-gap-nmc";
// What a model might write from the answer: the NMC claim, and a plain line that says only what the answer says.
const proposal = (evidence: string) => ({
  changes: [
    { gapId, section: "experience", before: lateShifts, after: "As an NMC registered nurse, supported the nurse in charge on late shifts", evidence, evidenceSource: "follow-up-answer" },
  ],
  nextSteps: [],
});

beforeEach(() => vi.clearAllMocks());

describe("answerGap after a yes that is not registration (#464)", () => {
  it.each([
    ["I'm a final-year student nurse and qualify in March.", "qualify in March"],
    ["Not registered yet, I qualify in March.", "I qualify in March"],
    ["I completed my BSc in Adult Nursing in 2022.", "BSc in Adult Nursing"],
  ])("keeps no NMC line after %s", async (answer, evidence) => {
    askModel.mockResolvedValue(proposal(evidence));
    // As the page sends a typed answer, and as an older page sent a tap with detail.
    for (const request of [{ answer: "", chosen: answer, typed: true }, { answer }]) {
      const result = await answerGap({ jobId: unregisteredFixtures.job.id, gapId, hasExperience: true, ...request });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.changes.map((change) => change.after)).toEqual([]);
    }
  });
});
