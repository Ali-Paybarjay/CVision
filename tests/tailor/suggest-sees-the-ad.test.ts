import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Proposal } from "@/features/tailor";

// Keeps the prompt each feature sends, and answers with the sample as mock mode does.
const sent = vi.hoisted(() => new Map<string, string>());
vi.mock("@/shared/ai", async (original) => ({
  ...(await original<typeof import("@/shared/ai")>()),
  askModel: vi.fn(async (options: { feature: string; prompt: string; sample: unknown }) => {
    sent.set(options.feature, options.prompt);
    return options.sample;
  }),
}));

const { proposeChanges, suggestFromCv } = await import("@/features/tailor");
const { personas } = await import("@/shared/sample-data");

const { profile, jobs, match } = personas.sara;
const empty: Proposal = { changes: [], nextSteps: [] };

describe("which prompts see the whole job ad (#403)", () => {
  beforeEach(() => sent.clear());

  it("gives tailor-suggest the whole ad, once per job", async () => {
    await suggestFromCv({ profile, job: jobs[0], match, sample: empty });
    expect(sent.get("tailor-suggest")).toContain(JSON.stringify(jobs[0].description));
  });

  it("reminds tailor-suggest that the ad is never evidence", async () => {
    await suggestFromCv({ profile, job: jobs[0], match, sample: empty });
    expect(sent.get("tailor-suggest")).toContain("a duty in the ad is not something the person has done");
  });

  it("keeps the ad text out of tailor-propose, which runs for every answer", async () => {
    await proposeChanges({ profile, job: jobs[0], match, answers: [], sample: empty });
    const prompt = sent.get("tailor-propose");
    expect(prompt).toBeDefined();
    expect(prompt).not.toContain(JSON.stringify(jobs[0].description));
    expect(prompt).toContain(jobs[0].requirements.essential[0]);
  });
});
