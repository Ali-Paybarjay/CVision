import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteMyAccount, type DeleteAccountState } from "./data-rights-actions";
import { userTables } from "./data-rights";
import { fakeAdmin, type FakeAdminOptions, type FakeData } from "./test-support";

const { getVerifiedUser, createSupabaseServerClient, getSupabaseAdmin, signOut, track, redirect, refresh, cookieJar, deferred } =
  vi.hoisted(() => ({
    getVerifiedUser: vi.fn(),
    createSupabaseServerClient: vi.fn(),
    getSupabaseAdmin: vi.fn(),
    signOut: vi.fn(),
    track: vi.fn(),
    // Like the real one, redirect() ends the action by throwing.
    redirect: vi.fn((path: string) => {
      throw new Error(`NEXT_REDIRECT ${path}`);
    }),
    refresh: vi.fn(),
    // The browser's cookies as the action sees them: name to value, and the options of each one set.
    cookieJar: { values: new Map<string, string>(), options: new Map<string, unknown>() },
    deferred: [] as (() => unknown)[],
  }));
vi.mock("./verified-user", () => ({ getVerifiedUser }));
vi.mock("@/shared/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("@/shared/supabase/admin", () => ({ getSupabaseAdmin }));
vi.mock("@/shared/analytics/track", () => ({ track }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({ refresh }));
vi.mock("next/server", () => ({ after: (work: () => unknown) => deferred.push(work) }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [...cookieJar.values].map(([name, value]) => ({ name, value })),
    has: (name: string) => cookieJar.values.has(name),
    set: (name: string, value: string, options: unknown) => {
      cookieJar.values.set(name, value);
      cookieJar.options.set(name, options);
    },
    delete: (name: string) => void cookieJar.values.delete(name),
  }),
}));

const sara = "5d1c7a8e-2b3f-4c6d-9e0a-1b2c3d4e5f60";
const reza = "8a9b0c1d-2e3f-4a5b-8c6d-7e8f9a0b1c2d";
const idle: DeleteAccountState = { status: "idle" };
const sessionCookies = ["sb-abc-auth-token.0", "sb-abc-auth-token.1", "sb-abc-auth-token-code-verifier"];

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
  getVerifiedUser.mockResolvedValue({ id: sara, email: "sara@example.com" });
  signOut.mockResolvedValue({ error: null });
  createSupabaseServerClient.mockResolvedValue({ auth: { signOut } });
  cookieJar.values = new Map([...sessionCookies.map((name) => [name, "session"] as [string, string]), ["theme", "dark"]]);
  cookieJar.options = new Map();
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
  expect(cookieJar.values.has("cvision-account-deleted")).toBe(false);
}

describe("deleteMyAccount", () => {
  it("deletes the CV files and the account, signs this browser out and goes to the confirmation page", async () => {
    await expect(deleteMyAccount(idle, typed("DELETE"))).rejects.toThrow("NEXT_REDIRECT /dashboard/your-data/deleted");

    expect([...data.files.keys()]).toEqual([`${reza}/cv.pdf`]);
    expect(admin.calls.deleteUser).toEqual([sara]);
    for (const table of userTables) expect(data.tables[table].map((row) => row.user_id)).toEqual([reza]);
    expect(signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
  });

  it("lets only the confirmation page know, for two minutes, that this browser has just deleted its account", async () => {
    await expect(deleteMyAccount(idle, typed("DELETE"))).rejects.toThrow("NEXT_REDIRECT");

    expect(cookieJar.values.get("cvision-account-deleted")).toBe("1");
    expect(cookieJar.options.get("cvision-account-deleted")).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/dashboard/your-data/deleted",
      maxAge: 120,
    });
  });

  it("records the deletion with counts only, and no user id", async () => {
    await expect(deleteMyAccount(idle, typed("DELETE"))).rejects.toThrow("NEXT_REDIRECT");
    for (const work of deferred.splice(0)) await work();

    expect(track).toHaveBeenCalledWith("account.deleted", { rows: 9, cvFiles: 1 });
    expect(JSON.stringify(track.mock.calls)).not.toContain(sara);
  });

  it.each([["delete"], ["Delete"], [" DELETE"], ["DELETE "], ["DELET"], ["yes"], [""]])(
    'deletes nothing when the typed word is "%s"',
    async (word) => {
      expect(await deleteMyAccount(idle, typed(word))).toEqual({
        status: "cancelled",
        title: "Nothing was deleted",
        message: "You did not type DELETE, so your account and data are unchanged.",
        partial: false,
      });
      nothingWasDeleted();
      expect(getVerifiedUser).not.toHaveBeenCalled();
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

  it("deletes nothing when Supabase Auth does not confirm the sign-in, as for a session signed out elsewhere", async () => {
    getVerifiedUser.mockResolvedValue(null);

    expect(await deleteMyAccount(idle, typed("DELETE"))).toEqual({
      status: "failed",
      title: "Nothing was deleted",
      message: "We could not confirm that you are signed in. Sign in again, then try once more.",
      partial: false,
    });
    nothingWasDeleted();
  });

  it("says so when deletion is not switched on", async () => {
    getSupabaseAdmin.mockReturnValue(null);

    expect(await deleteMyAccount(idle, typed("DELETE"))).toEqual({
      status: "failed",
      title: "Nothing was deleted",
      message: "Deleting accounts is not switched on yet. Try again later.",
      partial: false,
    });
    expect(signOut).not.toHaveBeenCalled();
  });

  it("says honestly that the files are gone but the account is not, and refreshes the counts", async () => {
    useAdmin({ fail: ["deleteUser"] });
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await deleteMyAccount(idle, typed("DELETE"))).toEqual({
      status: "failed",
      title: "Your account was not deleted",
      message: "We deleted your CV file, but could not delete your account. Your account and the rest of your data are still here. Try again to finish.",
      partial: true,
    });
    expect(refresh).toHaveBeenCalledOnce();
    expect(signOut).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
    expect(deferred).toHaveLength(0);
    expect(cookieJar.values.has("cvision-account-deleted")).toBe(false);
  });

  it("says how many files went when removing them stopped part way", async () => {
    data.files.set(`${sara}/old/cv.pdf`, new Uint8Array([3]));
    useAdmin({ removeAtMost: 1 });
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await deleteMyAccount(idle, typed("DELETE"))).toMatchObject({
      status: "failed",
      title: "Your account was not deleted",
      message: expect.stringContaining("We deleted 1 of your CV files, then something went wrong."),
      partial: true,
    });
    expect(admin.calls.deleteUser).toEqual([]);
  });

  it("does not say nothing was deleted when removing the files was asked for and failed", async () => {
    useAdmin({ fail: ["remove"] });
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await deleteMyAccount(idle, typed("DELETE"))).toEqual({
      status: "failed",
      title: "Your account was not deleted",
      message:
        "Some of your CV files may have been deleted, then something went wrong. Your account and the rest of your data are still here. Try again to finish.",
      partial: true,
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("says nothing was deleted when it failed before deleting anything", async () => {
    useAdmin({ fail: ["list"] });
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await deleteMyAccount(idle, typed("DELETE"))).toEqual({
      status: "failed",
      title: "Nothing was deleted",
      message: "We could not delete your account just now. Try again in a few minutes.",
      partial: false,
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("never says nothing was deleted after a try that deleted some files", async () => {
    const afterFiles: DeleteAccountState = { status: "failed", title: "Your account was not deleted", message: "…", partial: true };

    expect(await deleteMyAccount(afterFiles, typed("delete"))).toEqual({
      status: "cancelled",
      title: "Nothing more was deleted",
      message: "You did not type DELETE. Your account and the rest of your data are still here.",
      partial: true,
    });

    useAdmin({ fail: ["list"] });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await deleteMyAccount(afterFiles, typed("DELETE"))).toMatchObject({ title: "Nothing more was deleted", partial: true });
  });

  it("counts an account that is already gone as deleted, as when another tab finished first", async () => {
    useAdmin({ fail: ["deleteUser:not-found"] });

    await expect(deleteMyAccount(idle, typed("DELETE"))).rejects.toThrow("NEXT_REDIRECT /dashboard/your-data/deleted");
    expect(cookieJar.values.get("cvision-account-deleted")).toBe("1");
  });

  it("removes the session cookies itself when signing out fails, and still shows the confirmation", async () => {
    signOut.mockResolvedValue({ error: { name: "AuthRetryableFetchError", status: 0 } });

    await expect(deleteMyAccount(idle, typed("DELETE"))).rejects.toThrow("NEXT_REDIRECT /dashboard/your-data/deleted");

    expect(admin.calls.deleteUser).toEqual([sara]);
    for (const name of sessionCookies) expect(cookieJar.values.has(name)).toBe(false);
    expect(cookieJar.values.get("theme")).toBe("dark");
    expect(cookieJar.values.get("cvision-account-deleted")).toBe("1");
  });

  it("removes the session cookies itself when signing out throws", async () => {
    signOut.mockRejectedValue(new Error("network"));

    await expect(deleteMyAccount(idle, typed("DELETE"))).rejects.toThrow("NEXT_REDIRECT /dashboard/your-data/deleted");
    for (const name of sessionCookies) expect(cookieJar.values.has(name)).toBe(false);
  });

  it("leaves the session cookies to Supabase when signing out works", async () => {
    await expect(deleteMyAccount(idle, typed("DELETE"))).rejects.toThrow("NEXT_REDIRECT");

    // The real signOut removes them through the client's cookie adapter; this test's fake does not.
    expect(cookieJar.values.has("sb-abc-auth-token.0")).toBe(true);
  });
});
