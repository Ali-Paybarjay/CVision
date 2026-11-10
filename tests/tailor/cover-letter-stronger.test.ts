// A no to a "Make it stronger" question reaches the letter apart from `declined` (#315): the CV line stays usable,
// but the letter is told not to add what the question asked about.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nothingMoreToAdd, strongerGaps } from "@/features/tailor";
import { createCoverLetter } from "@/features/tailor/actions";
import { personas } from "@/shared/sample-data";

const { askModel } = vi.hoisted(() => ({ askModel: vi.fn() }));
vi.mock("@/shared/ai", async (original) => {
  const real = await original<typeof import("@/shared/ai")>();
  return { ...real, askModel: (options: Parameters<typeof real.askModel>[0]) => (askModel(options), real.askModel(options)) };
});
vi.mock("@/features/account/current-user", () => ({ getCurrentUser: async () => null }));
vi.mock("@/shared/supabase/server", () => ({ createSupabaseServerClient: async () => null }));
vi.mock("@/shared/analytics/track", () => ({ track: vi.fn() }));
vi.mock("@/shared/ai/anonymous-key", () => ({ getAnonymousKey: async () => ({ anonymousKey: "visitor" }) }));
vi.mock("next/server", () => ({ after: (task: () => Promise<void>) => task() }));

const { profile, jobs, match } = personas.daniel;
const kpis = strongerGaps(jobs[0], match, profile).find((gap) => gap.requirement === "Managing to KPIs")!;
const kpiLine = "Report weekly sales, waste and availability KPIs to the area manager";
const question = "How do you use these KPIs to manage the store?";
const no = { gapId: kpis.id, question, answer: "Nothing more to add.", hasExperience: false };

beforeEach(() => vi.clearAllMocks());

describe("nothingMoreToAdd", () => {
  it("gives the question and the CV line it was about", () => {
    expect(nothingMoreToAdd([kpis], [no])).toEqual([{ question, cvLine: kpiLine }]);
  });

  it("leaves out a yes and a no to an ordinary gap", () => {
    const gap = match.gaps[0];
    expect(nothingMoreToAdd([kpis, gap], [{ ...no, hasExperience: true }, { ...no, gapId: gap.id }])).toEqual([]);
  });
});

describe("createCoverLetter with a no to a strength", () => {
  it("sends the question and its CV line to the letter, and declines nothing", async () => {
    const result = await createCoverLetter({ jobId: jobs[0].id, changes: [], answers: [no] });
    expect(result.ok).toBe(true);

    const prompt: string = askModel.mock.calls[0][0].prompt;
    const nothingMore = prompt.slice(prompt.indexOf("## Lines they had nothing more to add to"));
    expect(nothingMore).toContain(question);
    expect(nothingMore).toContain(kpiLine);
    // The CV line's own words, "KPIs" among them, stay allowed: the no is not a declined requirement.
    expect(prompt).toContain('"requirements": []');
  });
});
