import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCoverLetter } from "@/features/tailor/actions";
import { personas } from "@/shared/sample-data";

const { writeCoverLetter } = vi.hoisted(() => ({ writeCoverLetter: vi.fn() }));
vi.mock("@/features/tailor/cover-letter", async (original) => ({ ...(await original<typeof import("@/features/tailor/cover-letter")>()), writeCoverLetter }));
vi.mock("@/features/account/current-user", () => ({ getCurrentUser: async () => null }));
vi.mock("@/shared/supabase/server", () => ({ createSupabaseServerClient: async () => null }));
vi.mock("@/shared/analytics/track", () => ({ track: vi.fn() }));
vi.mock("@/shared/ai/anonymous-key", () => ({ getAnonymousKey: async () => ({ anonymousKey: "visitor" }) }));
vi.mock("next/server", () => ({ after: (task: () => Promise<void>) => task() }));

const gap = personas.sara.match.gaps.find((item) => item.requirement === "Power BI")!;
const request = { jobId: "sara-job-1", changes: [], answers: [{ gapId: gap.id, question: "", answer: "I haven't done this.", hasExperience: false }] };
const letter = (body: string) => ({ greeting: "Dear Hiring Manager,", paragraphs: [body], signOff: "Yours sincerely," });

beforeEach(() => vi.clearAllMocks());

describe("a draft that names something the user said no to (#251)", () => {
  it("tells the model what it named, tries once more, and returns the clean letter", async () => {
    writeCoverLetter.mockResolvedValueOnce(letter("I have built reports in Power BI.")).mockResolvedValueOnce(letter("I built Tableau dashboards."));
    const result = await createCoverLetter(request);

    expect(result).toMatchObject({ ok: true });
    expect(writeCoverLetter).toHaveBeenCalledTimes(2);
    expect(writeCoverLetter.mock.calls[0][0]).toMatchObject({ declined: ["Power BI"] });
    expect(writeCoverLetter.mock.calls[1][0]).toMatchObject({ declined: ["Power BI"], namedInLastDraft: ["power bi"] });
  });

  it("stops after the second try and says which item was the problem", async () => {
    writeCoverLetter.mockResolvedValue(letter("I have built reports in Power BI."));
    const result = await createCoverLetter(request);

    expect(writeCoverLetter).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("power bi");
  });

  it("asks only once when the first draft is clean", async () => {
    writeCoverLetter.mockResolvedValue(letter("I built Tableau dashboards."));
    expect(await createCoverLetter(request)).toMatchObject({ ok: true });
    expect(writeCoverLetter).toHaveBeenCalledTimes(1);
  });
});
