import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteMyAccount, type DeleteAccountState } from "./data-rights-actions";
import { userTables } from "./data-rights";
import { fakeAdmin, type FakeAdminOptions, type FakeData } from "./test-support";

const { getCurrentUser, createSupabaseServerClient, getSupabaseAdmin, signOut, track, redirect, deferred } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  signOut: vi.fn(),
  track: vi.fn(),
  // Like the real one, redirect() ends the action by throwing.
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  }),
  deferred: [] as (() => unknown)[],
}));
vi.mock("./current-user", () => ({ getCurrentUser }));
vi.mock("@/shared/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("@/shared/supabase/admin", () => ({ getSupabaseAdmin }));
vi.mock("@/shared/analytics/track", () => ({ track }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/server", () => ({ after: (work: () => unknown) => deferred.push(work) }));

const sara = "5d1c7a8e-2b3f-4c6d-9e0a-1b2c3d4e5f60";
const reza = "8a9b0c1d-2e3f-4a5b-8c6d-7e8f9a0b1c2d";
const idle: DeleteAccountState = { status: "idle" };

let data: FakeData;
let admin: ReturnType<typeof fakeAdmin>;

function useAdmin(options: FakeAdminOptions = {}) {
  admin = fakeAdmin(data, options);
  getSupabaseAdmin.mockReturnValue(admin.client);
}

function typed(word: string | null) {
  const formData = new FormData();
  if (word !== null) formData.set("confirmation", word);
  return formData;
}

beforeEach(() => {
  data = {
    tables: Object.fromEntries(
      userTables.map((table) => [
        table,
        [
          { id: `${table}-1`, user_id: sara },
          { id: `${table}-2`, user_id: reza },
        ],
      ]),
    ),
    files: new Map([
      [`${sara}/cv.pdf`, new Uint8Array([1])],
      [`${reza}/cv.pdf`, new Uint8Array([2])],
    ]),
  };
  useAdmin();
  getCurrentUser.mockResolvedValue({ id: sara, email: "sara@example.com" });
  signOut.mockResolvedValue({ error: null });
  createSupabaseServerClient.mockResolvedValue({ auth: { signOut } });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  deferred.length = 0;
});

function nothingWasDeleted() {
  expect(admin.calls.removed).toEqual([]);
  expect(admin.calls.deleteUser).toEqual([]);
  expect(data.files.size).toBe(2);
  expect(signOut).not.toHaveBeenCalled();
}

describe("deleteMyAccount", () => {
  it("deletes the CV files and the account, signs out and goes to the confirmation page", async () => {
    await expect(deleteMyAccount(idle, typed("DELETE"))).rejects.toThrow("NEXT_REDIRECT /dashboard/your-data/deleted");

    expect([...data.files.keys()]).toEqual([`${reza}/cv.pdf`]);
    expect(admin.calls.deleteUser).toEqual([sara]);
    for (const table of userTables) expect(data.tables[table].map((row) => row.user_id)).toEqual([reza]);
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("records the deletion with counts only, and no user id", async () => {
    await expect(deleteMyAccount(idle, typed("DELETE"))).rejects.toThrow("NEXT_REDIRECT");
    for (const work of deferred.splice(0)) await work();

    expect(track).toHaveBeenCalledWith("account.deleted", { rows: 8, cvFiles: 1 });
    expect(JSON.stringify(track.mock.calls)).not.toContain(sara);
  });

  it.each([["delete"], ["Delete"], [" DELETE"], ["DELETE "], ["DELET"], ["yes"], [""]])(
    'deletes nothing when the typed word is "%s"',
    async (word) => {
      expect(await deleteMyAccount(idle, typed(word))).toEqual({
        status: "cancelled",
        title: "Nothing was deleted",
        message: "You did not type DELETE, so your account and data are unchanged.",
      });
      nothingWasDeleted();
      expect(getCurrentUser).not.toHaveBeenCalled();
    },
  );

  it("deletes nothing when the word is missing", async () => {
    expect(await deleteMyAccount(idle, typed(null))).toMatchObject({ status: "cancelled", title: "Nothing was deleted" });
    nothingWasDeleted();
  });

  it("takes the user from the session, never from the form", async () => {
    const formData = typed("DELETE");
    formData.set("userId", reza);

    await expect(deleteMyAccount(idle, formData)).rejects.toThrow("NEXT_REDIRECT");

    expect(admin.calls.deleteUser).toEqual([sara]);
    expect(data.files.has(`${reza}/cv.pdf`)).toBe(true);
  });

  it("deletes nothing for a signed-out visitor", async () => {
    getCurrentUser.mockResolvedValue(null);

    expect(await deleteMyAccount(idle, typed("DELETE"))).toMatchObject({ status: "failed", title: "Nothing was deleted" });
    nothingWasDeleted();
  });

  it("says so when deletion is not switched on", async () => {
    getSupabaseAdmin.mockReturnValue(null);

    expect(await deleteMyAccount(idle, typed("DELETE"))).toEqual({
      status: "failed",
      title: "Nothing was deleted",
      message: "Deleting accounts is not switched on yet. Try again later.",
    });
    expect(signOut).not.toHaveBeenCalled();
  });

  it("says honestly that the files are gone but the account is not", async () => {
    useAdmin({ fail: ["deleteUser"] });
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await deleteMyAccount(idle, typed("DELETE"))).toEqual({
      status: "failed",
      title: "Your account was not deleted",
      message: "We deleted your CV file, but could not delete your account. Your account and the rest of your data are still here. Try again to finish.",
    });
    expect(signOut).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
    expect(deferred).toHaveLength(0);
  });

  it("says how many files went when removing them stopped part way", async () => {
    data.files.set(`${sara}/old/cv.pdf`, new Uint8Array([3]));
    useAdmin({ removeAtMost: 1 });
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await deleteMyAccount(idle, typed("DELETE"))).toMatchObject({
      status: "failed",
      title: "Your account was not deleted",
      message: expect.stringContaining("We deleted 1 of your CV files, then something went wrong."),
    });
    expect(admin.calls.deleteUser).toEqual([]);
  });

  it("says nothing was deleted when it failed before deleting anything", async () => {
    useAdmin({ fail: ["remove"] });
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await deleteMyAccount(idle, typed("DELETE"))).toEqual({
      status: "failed",
      title: "Nothing was deleted",
      message: "We could not delete your account just now. Try again in a few minutes.",
    });
  });

  it("still shows the confirmation when signing out fails after the deletion", async () => {
    signOut.mockRejectedValue(new Error("network"));

    await expect(deleteMyAccount(idle, typed("DELETE"))).rejects.toThrow("NEXT_REDIRECT /dashboard/your-data/deleted");
    expect(admin.calls.deleteUser).toEqual([sara]);
  });
});
