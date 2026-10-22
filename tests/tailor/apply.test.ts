import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordApply } from "@/features/tailor/actions";

const { recordApplication, track } = vi.hoisted(() => ({ recordApplication: vi.fn(), track: vi.fn() }));
vi.mock("@/features/tracker/actions", () => ({ recordApplication }));
vi.mock("@/shared/analytics/track", () => ({ track }));
vi.mock("@/features/account/current-user", () => ({ getCurrentUser: async () => ({ id: "user-1", email: null }) }));
vi.mock("@/shared/supabase/server", () => ({ createSupabaseServerClient: async () => null }));
vi.mock("@/shared/ai/anonymous-key", () => ({ getAnonymousKey: async () => ({ anonymousKey: "visitor" }) }));
vi.mock("next/server", () => ({ after: (task: () => Promise<void>) => task() }));

beforeEach(() => vi.clearAllMocks());

describe("recordApply", () => {
  it("adds the job to the tracker and records the click", async () => {
    recordApplication.mockResolvedValue({ ok: true, created: true, application: {} });
    const result = await recordApply("0b6f2d3e-6a51-4c1e-9d6e-2f6c1a7b9e10");

    expect(result.recorded).toBe(true);
    expect(recordApplication).toHaveBeenCalledWith("0b6f2d3e-6a51-4c1e-9d6e-2f6c1a7b9e10");
    expect(track).toHaveBeenCalledWith("tailor.apply_clicked", { recorded: true, reason: "created" }, { userId: "user-1" });
  });

  it("passes on the tracker's reason when it cannot record, such as a sample job", async () => {
    recordApplication.mockResolvedValue({ ok: false, reason: "sample-job", message: "This is a sample job, so it is not added to your tracker." });
    const result = await recordApply("sara-job-1");

    expect(result).toEqual({ recorded: false, message: "This is a sample job, so it is not added to your tracker." });
    expect(track).toHaveBeenCalledWith("tailor.apply_clicked", { recorded: false, reason: "sample-job" }, { userId: "user-1" });
  });

  it("refuses an empty job id without touching the tracker", async () => {
    expect((await recordApply("")).recorded).toBe(false);
    expect(recordApplication).not.toHaveBeenCalled();
  });
});
