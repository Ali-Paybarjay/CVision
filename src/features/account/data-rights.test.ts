import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteAccount, exportUserData, summariseUserData, totalRows, userTables } from "./data-rights";
import { fakeAdmin, readZip, type FakeAdminOptions, type FakeData } from "./test-support";
import { joinChunks } from "./zip";

const { getSupabaseAdmin, createSupabaseServerClient } = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn(),
  createSupabaseServerClient: vi.fn(),
}));
vi.mock("@/shared/supabase/admin", () => ({ getSupabaseAdmin }));
vi.mock("@/shared/supabase/server", () => ({ createSupabaseServerClient }));

const sara = "5d1c7a8e-2b3f-4c6d-9e0a-1b2c3d4e5f60";
const reza = "8a9b0c1d-2e3f-4a5b-8c6d-7e8f9a0b1c2d";
const now = new Date("2026-10-23T10:00:00Z");
const bytes = (value: string) => new TextEncoder().encode(value);
const contractTables = userTables.filter((table) => table !== "events" && table !== "ai_usage");

let data: FakeData;
/** The admin client (secret key), and the user's own client, which row-level security limits to their rows. */
let admin: ReturnType<typeof fakeAdmin>;
let own: ReturnType<typeof fakeAdmin>;

/** Sara has rows in every table (two jobs' worth in some) and three CV files, one in a folder; Reza has his own. */
function seed(): FakeData {
  const tables: FakeData["tables"] = {};
  for (const table of userTables) {
    tables[table] = [
      { id: `${table}-1`, user_id: sara, data: { table } },
      { id: `${table}-2`, user_id: reza, data: { table } },
    ];
  }
  tables.jobs.push({ id: "jobs-3", user_id: sara, data: { title: "Graduate Data Analyst" } });
  tables.ai_usage.push({ id: "ai_usage-3", user_id: sara, feature: "profile", input_tokens: 1200 });
  // Before Sara signed in: not linked to any account.
  tables.events.push({ id: "events-3", user_id: null, anonymous_id: "3f9a", name: "home.cta_clicked" });
  return {
    tables,
    files: new Map([
      [`${sara}/cv.pdf`, bytes("%PDF sara")],
      [`${sara}/cv-2026.docx`, bytes("PK sara")],
      [`${sara}/old/first-cv.pdf`, bytes("%PDF old")],
      [`${reza}/cv.pdf`, bytes("%PDF reza")],
    ]),
    users: {
      [sara]: {
        id: sara,
        aud: "authenticated",
        role: "authenticated",
        email: "sara@example.com",
        phone: "",
        created_at: "2026-10-21T09:00:00Z",
        updated_at: "2026-10-23T08:00:00Z",
        confirmation_sent_at: "2026-10-21T09:00:00Z",
        email_confirmed_at: "2026-10-21T09:05:00Z",
        last_sign_in_at: "2026-10-23T08:00:00Z",
        app_metadata: { provider: "email", providers: ["email"] },
        user_metadata: { email: "sara@example.com", email_verified: true },
        identities: [
          {
            id: sara,
            user_id: sara,
            identity_id: "identity-1",
            provider: "email",
            identity_data: { email: "sara@example.com", sub: sara },
            created_at: "2026-10-21T09:00:00Z",
            last_sign_in_at: "2026-10-23T08:00:00Z",
            updated_at: "2026-10-23T08:00:00Z",
          },
        ],
        // Never returned by Supabase, but it must not reach the file even if it were.
        confirmation_token: "token-must-not-leak",
      },
      [reza]: { id: reza, email: "reza@example.com", created_at: "2026-10-22T09:00:00Z", user_metadata: {} },
    },
  };
}

function useAdmin(options: FakeAdminOptions = {}) {
  admin = fakeAdmin(data, options);
  own = fakeAdmin(data, options);
  getSupabaseAdmin.mockReturnValue(admin.client);
  createSupabaseServerClient.mockResolvedValue(own.client);
}

beforeEach(() => {
  data = seed();
  useAdmin();
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("summariseUserData", () => {
  it("counts the user's rows in all eight tables and their CV files, in nested folders too", async () => {
    const result = await summariseUserData(sara);

    expect(result).toEqual({
      ok: true,
      summary: {
        rows: {
          profiles: 1,
          jobs: 2,
          match_results: 1,
          tailoring_changes: 1,
          interview_sessions: 1,
          applications: 1,
          events: 1,
          ai_usage: 2,
        },
        cvFiles: 3,
      },
    });
    expect(result.ok && totalRows(result.summary)).toBe(10);
  });

  it("counts CV files across pages of the Storage listing", async () => {
    for (let i = 0; i < 150; i++) data.files.set(`${sara}/drafts/cv-${String(i).padStart(3, "0")}.pdf`, bytes("x"));

    const result = await summariseUserData(sara);

    expect(result.ok && result.summary.cvFiles).toBe(153);
  });

  it("counts the user's own tables as the user, so row-level security checks them too, and the rest as admin", async () => {
    await summariseUserData(sara);

    expect(own.calls.from).toEqual(contractTables);
    expect(admin.calls.from).toEqual(["events", "ai_usage"]);
  });

  it("says when the admin client is not configured", async () => {
    getSupabaseAdmin.mockReturnValue(null);

    expect(await summariseUserData(sara)).toEqual({ ok: false, reason: "not-connected" });
  });

  it("says when Supabase is not configured for the user", async () => {
    createSupabaseServerClient.mockResolvedValue(null);

    expect(await summariseUserData(sara)).toEqual({ ok: false, reason: "not-connected" });
  });

  it("reports a failed count with the step and code only", async () => {
    useAdmin({ fail: ["count:ai_usage"] });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await summariseUserData(sara)).toEqual({ ok: false, reason: "failed" });
    expect(consoleError).toHaveBeenCalledWith("account: could not count ai_usage (57014)");
  });
});

describe("exportUserData", () => {
  const user = { id: sara, email: "sara@example.com" };

  it("puts every row of the user in all eight tables, and their CV files, in one ZIP", async () => {
    const result = await exportUserData(user, now);
    if (!result.ok) throw new Error("export failed");

    const files = readZip(joinChunks(result.chunks));
    expect(files.map((file) => file.name)).toEqual(["data.json", "cv-files/cv-2026.docx", "cv-files/cv.pdf", "cv-files/old/first-cv.pdf"]);
    expect(new TextDecoder().decode(files[2].data)).toBe("%PDF sara");
    expect(new TextDecoder().decode(files[3].data)).toBe("%PDF old");

    const json = JSON.parse(new TextDecoder().decode(files[0].data));
    expect(json.exportedAt).toBe("2026-10-23T10:00:00.000Z");
    expect(Object.keys(json.tables)).toEqual([...userTables]);
    for (const table of userTables) {
      expect(json.tables[table].length).toBeGreaterThan(0);
      expect(json.tables[table].every((row: { user_id: string }) => row.user_id === sara)).toBe(true);
    }
    expect(json.tables.jobs).toEqual([
      { id: "jobs-1", user_id: sara, data: { table: "jobs" } },
      { id: "jobs-3", user_id: sara, data: { title: "Graduate Data Analyst" } },
    ]);
    expect(json.cvFiles).toEqual(["cv-files/cv-2026.docx", "cv-files/cv.pdf", "cv-files/old/first-cv.pdf"]);

    expect(result.fileName).toBe("cvision-data-2026-10-23.zip");
    expect(result.summary.cvFiles).toBe(3);
    expect(totalRows(result.summary)).toBe(10);
  });

  it("includes the account's details from Supabase Auth, and says what it leaves out", async () => {
    const result = await exportUserData(user, now);
    if (!result.ok) throw new Error("export failed");

    const json = JSON.parse(new TextDecoder().decode(readZip(joinChunks(result.chunks))[0].data));
    expect(json.account).toEqual({
      id: sara,
      email: "sara@example.com",
      phone: null,
      created_at: "2026-10-21T09:00:00Z",
      updated_at: "2026-10-23T08:00:00Z",
      confirmation_sent_at: "2026-10-21T09:00:00Z",
      email_confirmed_at: "2026-10-21T09:05:00Z",
      recovery_sent_at: null,
      last_sign_in_at: "2026-10-23T08:00:00Z",
      sign_in_methods: [{ provider: "email", created_at: "2026-10-21T09:00:00Z", last_sign_in_at: "2026-10-23T08:00:00Z" }],
      user_metadata: { email: "sara@example.com", email_verified: true },
    });
    expect(json.about).toContain("apart from what notIncluded lists");
    expect(json.notIncluded.join(" ")).toContain("IP address and browser details");
    expect(json.notIncluded.join(" ")).toContain("saved only in a browser");
    expect(new TextDecoder().decode(joinChunks(result.chunks))).not.toContain("token-must-not-leak");
  });

  it("reads the user's own tables as the user, and only events and ai_usage as admin", async () => {
    await exportUserData(user, now);

    expect([...new Set(own.calls.from)]).toEqual(contractTables);
    expect([...new Set(admin.calls.from)]).toEqual(["events", "ai_usage"]);
  });

  it("gives no file at all when the account's details cannot be read", async () => {
    useAdmin({ fail: ["getUserById"] });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await exportUserData(user, now)).toEqual({ ok: false, reason: "failed" });
    expect(consoleError).toHaveBeenCalledWith("account: could not read the account (unexpected_failure)");
  });

  it("includes nothing of another user's", async () => {
    const result = await exportUserData(user, now);
    if (!result.ok) throw new Error("export failed");

    const archive = new TextDecoder().decode(joinChunks(result.chunks));
    expect(archive).not.toContain(reza);
    expect(archive).not.toContain("%PDF reza");
    expect(archive).not.toContain("3f9a");
  });

  it("reads every page of a long table", async () => {
    for (let i = 0; i < 2500; i++) data.tables.ai_usage.push({ id: `bulk-${String(i).padStart(4, "0")}`, user_id: sara, feature: "interview" });

    const result = await exportUserData(user, now);
    if (!result.ok) throw new Error("export failed");

    const json = JSON.parse(new TextDecoder().decode(readZip(joinChunks(result.chunks))[0].data));
    expect(json.tables.ai_usage).toHaveLength(2502);
  });

  it("gives no file at all when a CV file cannot be read", async () => {
    useAdmin({ fail: ["download"] });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await exportUserData(user, now)).toEqual({ ok: false, reason: "failed" });
    expect(consoleError).toHaveBeenCalledWith("account: could not download a CV file (404)");
  });

  it("says when the admin client is not configured", async () => {
    getSupabaseAdmin.mockReturnValue(null);

    expect(await exportUserData(user, now)).toEqual({ ok: false, reason: "not-connected" });
  });
});

describe("deleteAccount", () => {
  it("removes every CV file of the user, then deletes the user, whose rows go with them", async () => {
    const result = await deleteAccount(sara);

    expect(result).toMatchObject({ ok: true, summary: { cvFiles: 3 } });
    expect([...data.files.keys()]).toEqual([`${reza}/cv.pdf`]);
    expect(admin.calls.removed.flat().sort()).toEqual([`${sara}/cv-2026.docx`, `${sara}/cv.pdf`, `${sara}/old/first-cv.pdf`]);
    expect(admin.calls.deleteUser).toEqual([sara]);
    for (const table of userTables) expect(data.tables[table].some((row) => row.user_id === sara)).toBe(false);
    // Reza's rows stay, and so does the record from before Sara signed in.
    for (const table of userTables) expect(data.tables[table].some((row) => row.user_id === reza)).toBe(true);
    expect(data.tables.events.some((row) => row.anonymous_id === "3f9a")).toBe(true);
  });

  it("removes files across many pages, in batches", async () => {
    for (let i = 0; i < 250; i++) data.files.set(`${sara}/drafts/cv-${String(i).padStart(3, "0")}.pdf`, bytes("x"));

    expect(await deleteAccount(sara)).toMatchObject({ ok: true, summary: { cvFiles: 253 } });
    expect([...data.files.keys()]).toEqual([`${reza}/cv.pdf`]);
    expect(Math.max(...admin.calls.removed.map((batch) => batch.length))).toBeLessThanOrEqual(100);
  });

  it("deletes a user who has no CV files", async () => {
    for (const key of [...data.files.keys()]) if (key.startsWith(sara)) data.files.delete(key);

    expect(await deleteAccount(sara)).toMatchObject({ ok: true, summary: { cvFiles: 0 } });
    expect(admin.calls.removed).toEqual([]);
    expect(admin.calls.deleteUser).toEqual([sara]);
  });

  it("deletes nothing when it cannot first see what there is", async () => {
    useAdmin({ fail: ["list"] });
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await deleteAccount(sara)).toEqual({ ok: false, reason: "failed", step: "start", cvFilesRemoved: 0, removeAttempted: false });
    expect(admin.calls.removed).toEqual([]);
    expect(admin.calls.deleteUser).toEqual([]);
    expect(data.files.size).toBe(4);
  });

  it("keeps the account when the CV files cannot be removed, and says the removal was asked for", async () => {
    useAdmin({ fail: ["remove"] });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    // Storage can delete files and still answer with an error, so some may be gone.
    expect(await deleteAccount(sara)).toEqual({ ok: false, reason: "failed", step: "files", cvFilesRemoved: 0, removeAttempted: true });
    expect(admin.calls.deleteUser).toEqual([]);
    expect(consoleError).toHaveBeenCalledWith("account: could not remove the CV files (500)");
  });

  it("keeps the account, and says how many files went, when some files are still there afterwards", async () => {
    useAdmin({ removeAtMost: 1 });
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await deleteAccount(sara)).toEqual({ ok: false, reason: "failed", step: "files", cvFilesRemoved: 1, removeAttempted: true });
    expect(admin.calls.deleteUser).toEqual([]);
  });

  it("says the files are gone but the account is not when deleting the user fails", async () => {
    useAdmin({ fail: ["deleteUser"] });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await deleteAccount(sara)).toEqual({ ok: false, reason: "failed", step: "account", cvFilesRemoved: 3, removeAttempted: true });
    expect(data.tables.profiles.some((row) => row.user_id === sara)).toBe(true);
    expect(consoleError).toHaveBeenCalledWith("account: could not delete the account (unexpected_failure)");
  });

  it("counts a user who is already gone as deleted, as when another tab finished first", async () => {
    useAdmin({ fail: ["deleteUser:not-found"] });

    expect(await deleteAccount(sara)).toMatchObject({ ok: true, summary: { cvFiles: 3 } });
  });

  it("counts and deletes with the admin client only", async () => {
    await deleteAccount(sara);

    expect(own.calls.from).toEqual([]);
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("never logs the user id or a file name", async () => {
    useAdmin({ fail: ["remove"] });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await deleteAccount(sara);

    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(sara);
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("cv.pdf");
  });

  it("says when the admin client is not configured", async () => {
    getSupabaseAdmin.mockReturnValue(null);

    expect(await deleteAccount(sara)).toEqual({ ok: false, reason: "not-connected" });
  });
});
