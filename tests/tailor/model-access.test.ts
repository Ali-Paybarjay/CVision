import { afterEach, describe, expect, it, vi } from "vitest";
import { modelFailureMessage, tailorModelAccess } from "@/features/tailor/server/model-access";
import { AskModelError } from "@/shared/ai";

const { getCurrentUser } = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/features/account/current-user", () => ({ getCurrentUser }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("tailorModelAccess", () => {
  it("counts a signed-in user's requests against their own daily limit", async () => {
    getCurrentUser.mockResolvedValue({ id: "user-1", email: null });
    vi.stubEnv("AI_MODE", "live");
    expect(await tailorModelAccess()).toEqual({ allowed: true, requester: { userId: "user-1" } });
  });

  it("in live mode, keeps visitors away from the model", async () => {
    getCurrentUser.mockResolvedValue(null);
    vi.stubEnv("AI_MODE", "live");
    expect(await tailorModelAccess()).toEqual({ allowed: false, message: "Sign in to get suggestions for your CV." });
  });

  it("in mock mode, keeps the demo open to everyone", async () => {
    getCurrentUser.mockResolvedValue(null);
    expect(await tailorModelAccess()).toEqual({ allowed: true, requester: undefined });
  });
});

describe("modelFailureMessage", () => {
  it("shows the daily limit's own message", () => {
    const error = new AskModelError("You have reached today's limit. Try again tomorrow.", "limit-reached");
    expect(modelFailureMessage(error, "suggest a change", "Try again in a moment.")).toBe("You have reached today's limit. Try again tomorrow.");
  });

  it("logs only the reason for any other failure, and shows the fallback", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new AskModelError("The answer did not match: Sara Khan, Built Tableau dashboards…", "invalid-answer");
    expect(modelFailureMessage(error, "suggest a change", "Try again in a moment.")).toBe("Try again in a moment.");
    expect(log).toHaveBeenCalledWith("tailor: could not suggest a change (invalid-answer)");
    expect(JSON.stringify(log.mock.calls)).not.toContain("Sara");
  });
});
