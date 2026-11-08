import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Proposal } from "@/features/tailor";
import type { Job } from "@/shared/contracts";

// Keeps the prompt each feature sends, and answers with the sample as mock mode does.
const sent = vi.hoisted(() => new Map<string, string>());
vi.mock("@/shared/ai", async (original) => ({
  ...(await original<typeof import("@/shared/ai")>()),
  askModel: vi.fn(async (options: { feature: string; prompt: string; sample: unknown }) => {
    sent.set(options.feature, options.prompt);
    return options.sample;
  }),
}));

const { askGapQuestions, proposeChanges, suggestFromCv, writeCoverLetter } = await import("@/features/tailor");
const { jobForPrompt } = await import("@/features/tailor/job-for-prompt");
const { clinicalFixtures } = await import("./clinical-fixture");

const { profile, match } = clinicalFixtures;
const role = { discipline: "Nursing", specialty: "Acute Medical Unit", level: "Band 6", registration: "NMC" };
const withRole = { ...clinicalFixtures.job, role };
// The same job as read before the role field existed.
const job: Job = { ...withRole, role: undefined };
const empty: Proposal = { changes: [], nextSteps: [] };
const features = ["tailor-gap-questions", "tailor-propose", "tailor-suggest", "tailor-cover-letter"];

async function sendAll(target: Job) {
  await askGapQuestions({ profile, job: target, match });
  await proposeChanges({ profile, job: target, match, answers: [], sample: empty });
  await suggestFromCv({ profile, job: target, match, sample: empty });
  await writeCoverLetter({ profile, job: target, changes: [], answers: [] });
}

describe("the tailor prompts read the job's role (#404)", () => {
  beforeEach(() => sent.clear());

  it("gives every tailor prompt the role, even tailor-propose, which never gets the whole ad", async () => {
    await sendAll(withRole);
    for (const feature of features) {
      const prompt = sent.get(feature);
      expect(prompt, feature).toBeDefined();
      expect(prompt, feature).toContain('"role": {');
      expect(prompt, feature).toContain('"level": "Band 6"');
      expect(prompt, feature).toContain('"registration": "NMC"');
      expect(prompt, feature).toContain("never claim the person holds that registration or level");
    }
    expect(sent.get("tailor-propose")).not.toContain(JSON.stringify(job.description));
  });

  it("works as before when the job has no role: old jobs and mock mode", async () => {
    await sendAll(job);
    for (const feature of features) expect(sent.get(feature), feature).not.toContain('"role":');
    expect(sent.get("tailor-gap-questions")).toContain("## The role first");
  });

  it("puts the role before the ad, and the ad only when asked", () => {
    expect(JSON.parse(jobForPrompt(withRole, { withAd: false }))).toEqual({ title: job.title, company: job.company, role, requirements: job.requirements });
    expect(Object.keys(JSON.parse(jobForPrompt(withRole, { withAd: true })))).toEqual(["title", "company", "role", "description", "requirements"]);
  });
});
