import { afterEach, describe, expect, it, vi } from "vitest";
import { personas } from "@/shared/sample-data";
import { suggestFollowUpQuestionsAction } from "./actions";
import { generateFollowUpQuestions } from "./server/generate-follow-up";

const { getCurrentUser } = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/features/account/current-user", () => ({ getCurrentUser }));
vi.mock("./server/generate-follow-up", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./server/generate-follow-up")>();
  return { ...actual, generateFollowUpQuestions: vi.fn(actual.generateFollowUpQuestions) };
});

const profile = personas.emma.profile;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("suggestFollowUpQuestionsAction", () => {
  it("writes questions for a signed-in user, counted against their own daily limit", async () => {
    getCurrentUser.mockResolvedValue({ id: "user-1", email: null });

    const result = await suggestFollowUpQuestionsAction(profile);

    expect(result.ok && result.questions.length).toBeGreaterThanOrEqual(3);
    expect(generateFollowUpQuestions).toHaveBeenCalledWith(profile, { requester: { userId: "user-1" } });
  });

  it("asks a signed-out visitor to sign in when the AI is live", async () => {
    vi.stubEnv("AI_MODE", "live");
    getCurrentUser.mockResolvedValue(null);

    const result = await suggestFollowUpQuestionsAction(profile);

    expect(result).toEqual({ ok: false, message: "Sign in to get questions about your profile." });
    expect(generateFollowUpQuestions).not.toHaveBeenCalled();
  });

  it("keeps the demo open to signed-out visitors in mock mode", async () => {
    getCurrentUser.mockResolvedValue(null);

    expect((await suggestFollowUpQuestionsAction(profile)).ok).toBe(true);
  });

  it("refuses a profile far larger than any real one, before reading it", async () => {
    getCurrentUser.mockResolvedValue({ id: "user-1", email: null });
    const huge = { ...profile, skills: Array.from({ length: 5000 }, (_, index) => `Skill number ${index}`) };

    const result = await suggestFollowUpQuestionsAction(huge);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toContain("too long");
    expect(generateFollowUpQuestions).not.toHaveBeenCalled();
  });

  it("refuses something that is not a profile", async () => {
    getCurrentUser.mockResolvedValue({ id: "user-1", email: null });

    expect((await suggestFollowUpQuestionsAction({ fullName: "Not a whole profile" })).ok).toBe(false);
  });
});
