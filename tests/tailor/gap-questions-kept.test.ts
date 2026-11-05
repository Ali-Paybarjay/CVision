import { beforeEach, describe, expect, it, vi } from "vitest";
import { askGapQuestions, defaultGapQuestion, forgetGapQuestions } from "@/features/tailor/gap-questions";
import { personas } from "@/shared/sample-data";

const { askModel } = vi.hoisted(() => ({ askModel: vi.fn() }));
vi.mock("@/shared/ai", () => ({ askModel, loadPrompt: async () => "prompt" }));

const { profile, jobs, match } = personas.sara;
const input = { profile, job: jobs[0], match, requester: { userId: "user-1" } };

beforeEach(() => {
  vi.useRealTimers();
  forgetGapQuestions();
  askModel.mockReset();
  askModel.mockImplementation(async () => ({ questions: match.gaps.map(defaultGapQuestion) }));
});

describe("the gap questions are asked once per user and job (#296)", () => {
  it("reuses the questions when the page opens again, and shares one request when two arrive together", async () => {
    const [first, second] = await Promise.all([askGapQuestions(input), askGapQuestions(input)]);
    const third = await askGapQuestions(input);
    expect(askModel).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    expect(third).toEqual(first);
  });

  it("asks again for another user, another job or a changed Profile", async () => {
    await askGapQuestions(input);
    await askGapQuestions({ ...input, requester: { userId: "user-2" } });
    await askGapQuestions({ ...input, job: jobs[1] });
    await askGapQuestions({ ...input, profile: { ...profile, summary: "Changed." } });
    expect(askModel).toHaveBeenCalledTimes(4);
  });

  it("does not keep a failure, so the next visit tries again", async () => {
    askModel.mockRejectedValueOnce(new Error("limit"));
    await expect(askGapQuestions(input)).rejects.toThrow("limit");
    await askGapQuestions(input);
    expect(askModel).toHaveBeenCalledTimes(2);
  });

  it("asks again after six hours", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-05T09:00:00Z") });
    await askGapQuestions(input);
    vi.setSystemTime(new Date("2026-11-05T15:01:00Z"));
    await askGapQuestions(input);
    expect(askModel).toHaveBeenCalledTimes(2);
  });
});
