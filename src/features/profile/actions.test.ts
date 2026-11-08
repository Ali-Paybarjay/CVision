import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteMyProfileAction } from "./actions";
import { deleteAccountProfile } from "./server/profile-account";

const { getCurrentUser, createSupabaseServerClient } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  createSupabaseServerClient: vi.fn(),
}));
vi.mock("@/features/account/current-user", () => ({ getCurrentUser }));
vi.mock("@/shared/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("./server/profile-account", () => ({ deleteAccountProfile: vi.fn(async () => true) }));

afterEach(() => {
  vi.clearAllMocks();
});

describe("deleteMyProfileAction", () => {
  it("deletes the signed-in user's profile and CV files", async () => {
    createSupabaseServerClient.mockResolvedValue({});
    getCurrentUser.mockResolvedValue({ id: "user-1", email: null });

    expect(await deleteMyProfileAction()).toEqual({ ok: true });
    expect(deleteAccountProfile).toHaveBeenCalledWith({}, "user-1");
  });

  it("deletes nothing for a signed-out visitor", async () => {
    createSupabaseServerClient.mockResolvedValue({});
    getCurrentUser.mockResolvedValue(null);

    expect(await deleteMyProfileAction()).toEqual({ ok: false, message: "Sign in to delete your profile." });
    expect(deleteAccountProfile).not.toHaveBeenCalled();
  });

  // Found in the batch review (#389): a Profile page left open for another account, after someone else signed in.
  it("deletes nothing from a page built for another account than the one signed in now", async () => {
    createSupabaseServerClient.mockResolvedValue({});
    getCurrentUser.mockResolvedValue({ id: "user-2", email: null });

    expect(await deleteMyProfileAction("user-1")).toEqual({
      ok: false,
      message: "You’re now signed in to a different account in this browser. Reload the page to see that account’s profile.",
    });
    expect(deleteAccountProfile).not.toHaveBeenCalled();
  });

  it("deletes the profile when the page was built for the account signed in now", async () => {
    createSupabaseServerClient.mockResolvedValue({});
    getCurrentUser.mockResolvedValue({ id: "user-1", email: null });

    expect(await deleteMyProfileAction("user-1")).toEqual({ ok: true });
    expect(deleteAccountProfile).toHaveBeenCalledWith({}, "user-1");
  });

  it("says so when the account couldn't delete it", async () => {
    createSupabaseServerClient.mockResolvedValue({});
    getCurrentUser.mockResolvedValue({ id: "user-1", email: null });
    vi.mocked(deleteAccountProfile).mockResolvedValueOnce(false);

    expect(await deleteMyProfileAction()).toMatchObject({ ok: false });
  });
});
