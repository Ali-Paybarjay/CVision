import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Application } from "@/shared/contracts";
import { closeWithoutNews, recordApplication, updateApplication } from "./actions";

const { getCurrentUser, createSupabaseServerClient, revalidatePath, track, deferred } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  revalidatePath: vi.fn(),
  track: vi.fn(),
  deferred: [] as (() => unknown)[],
}));
vi.mock("@/features/account/current-user", () => ({ getCurrentUser }));
vi.mock("@/shared/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("@/shared/analytics/track", () => ({ track }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/server", () => ({ after: (work: () => unknown) => deferred.push(work) }));

type Row = Record<string, unknown>;
type Tables = { jobs: Row[]; applications: Row[] };

/**
 * Just enough of the Supabase client for the tracker's actions, acting as one user: like row-level security,
 * every read and write sees only that user's rows.
 */
function fakeSupabase(tables: Tables, userId: string, options: { failInsert?: boolean; failUpdate?: boolean } = {}) {
  const own = (table: keyof Tables) => tables[table].filter((row) => row.user_id === userId);
  return {
    from(table: keyof Tables) {
      const filters: [string, unknown][] = [];
      const lists: [string, unknown[]][] = [];
      const matches = (row: Row) => filters.every(([c, v]) => row[c] === v) && lists.every(([c, values]) => values.includes(row[c]));
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => (filters.push([column, value]), query),
        in: (column: string, values: unknown[]) => (lists.push([column, values]), query),
        order: () => query,
        limit: () => query,
        maybeSingle: async () => ({ data: own(table).find(matches) ?? null, error: null }),
        // Copies, as the real client returns: changing what was read does not change the table.
        then: (resolve: (value: unknown) => void) => resolve({ data: structuredClone(own(table).filter(matches)), error: null }),
        insert: async (row: Row) => {
          if (options.failInsert) return { error: { code: "42501" } };
          tables[table].push({ ...row, user_id: userId });
          return { error: null };
        },
        update: (patch: Row) => ({
          eq: async (column: string, value: unknown) => {
            if (options.failUpdate) return { error: { code: "42501" } };
            for (const row of own(table)) if (row[column] === value) Object.assign(row, patch);
            return { error: null };
          },
        }),
      };
      return query;
    },
  };
}

const userId = "user-1";
const jobId = "0b6f2d3e-6a51-4c1e-9d6e-2f6c1a7b9e10";
const othersJobId = "7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f";
let tables: Tables;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-22T09:00:00Z"));
  tables = {
    jobs: [
      { id: jobId, user_id: userId },
      { id: othersJobId, user_id: "user-2" },
    ],
    applications: [],
  };
  getCurrentUser.mockResolvedValue({ id: userId, email: null });
  createSupabaseServerClient.mockImplementation(async () => fakeSupabase(tables, userId));
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  deferred.length = 0;
});

describe("recordApplication", () => {
  it("adds the user's job to their tracker as applied today", async () => {
    const result = await recordApplication(jobId);

    expect(result.ok && result.created).toBe(true);
    const application = result.ok ? result.application : null;
    expect(application).toMatchObject({ jobId, date: "2026-10-22", status: "applied", nextStep: null });
    expect(tables.applications).toEqual([{ id: application?.id, job_id: jobId, data: application, user_id: userId }]);
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("dates it by the UK calendar, not UTC", async () => {
    // 23:30 UTC on 21 October is 00:30 on 22 October in London (British Summer Time).
    vi.setSystemTime(new Date("2026-10-21T23:30:00Z"));

    const result = await recordApplication(jobId);

    expect(result.ok && result.application.date).toBe("2026-10-22");
  });

  it("adds nothing when Apply is pressed again", async () => {
    const first = await recordApplication(jobId);
    revalidatePath.mockClear();

    const second = await recordApplication(jobId);

    expect(second).toEqual({ ok: true, application: first.ok && first.application, created: false });
    expect(tables.applications).toHaveLength(1);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("adds nothing when Apply in another tab saved the job a moment earlier", async () => {
    const elsewhere: Application = { id: "c5d6e7f8-1a2b-4c3d-8e9f-0a1b2c3d4e5f", jobId, date: "2026-10-22", status: "applied", nextStep: null };
    const supabase = fakeSupabase(tables, userId);
    // The other tab's application lands after this press looked for one, so the unique key refuses this insert.
    createSupabaseServerClient.mockImplementationOnce(async () => ({
      from: (table: keyof Tables) => ({
        ...supabase.from(table),
        insert: async () => {
          tables.applications.push({ id: elsewhere.id, job_id: jobId, data: elsewhere, user_id: userId });
          return { error: { code: "23505" } };
        },
      }),
    }));

    expect(await recordApplication(jobId)).toEqual({ ok: true, application: elsewhere, created: false });
    expect(tables.applications).toHaveLength(1);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("keeps a status the user has already moved on", async () => {
    const interview: Application = { id: "a7e4c2b1-0d3f-4e5a-9b6c-1d2e3f4a5b6c", jobId, date: "2026-10-15", status: "interview", nextStep: "Prepare for Tuesday" };
    tables.applications.push({ id: interview.id, job_id: jobId, data: interview, user_id: userId });

    expect(await recordApplication(jobId)).toEqual({ ok: true, application: interview, created: false });
  });

  it("moves an application marked ready to applied", async () => {
    const ready: Application = { id: "a7e4c2b1-0d3f-4e5a-9b6c-1d2e3f4a5b6c", jobId, date: "2026-10-15", status: "ready", nextStep: null };
    tables.applications.push({ id: ready.id, job_id: jobId, data: ready, user_id: userId });

    const result = await recordApplication(jobId);

    expect(result).toEqual({ ok: true, application: { ...ready, status: "applied", date: "2026-10-22" }, created: false });
    expect(tables.applications[0].data).toEqual({ ...ready, status: "applied", date: "2026-10-22" });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("refuses a job from another account (issue #28)", async () => {
    const result = await recordApplication(othersJobId);

    expect(result).toMatchObject({ ok: false, reason: "job-not-found" });
    expect(tables.applications).toHaveLength(0);
  });

  it("does not track a sample job, which has no row in the jobs table", async () => {
    expect(await recordApplication("sara-job-1")).toMatchObject({ ok: false, reason: "sample-job" });
    expect(tables.applications).toHaveLength(0);
  });

  it("asks a signed-out visitor to sign in", async () => {
    getCurrentUser.mockResolvedValue(null);

    expect(await recordApplication(jobId)).toMatchObject({ ok: false, reason: "signed-out" });
    expect(tables.applications).toHaveLength(0);
  });

  it("says so when Supabase is not connected yet", async () => {
    createSupabaseServerClient.mockResolvedValue(null);

    expect(await recordApplication(jobId)).toMatchObject({ ok: false, reason: "not-connected" });
  });

  it("refuses anything that is not a job id", async () => {
    for (const value of [undefined, 42, { id: jobId }, "", "x".repeat(101)]) {
      expect(await recordApplication(value)).toMatchObject({ ok: false, reason: "job-not-found" });
    }
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("reports a database error without logging the job", async () => {
    createSupabaseServerClient.mockImplementation(async () => fakeSupabase(tables, userId, { failInsert: true }));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await recordApplication(jobId);

    expect(result).toMatchObject({ ok: false, reason: "failed" });
    expect(consoleError).toHaveBeenCalledWith("tracker: could not add to the tracker (42501)");
    expect(revalidatePath).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("updateApplication", () => {
  const applicationId = "a7e4c2b1-0d3f-4e5a-9b6c-1d2e3f4a5b6c";
  const applied: Application = { id: applicationId, jobId, date: "2026-10-15", status: "applied", nextStep: null };

  beforeEach(() => {
    tables.applications.push({ id: applicationId, job_id: jobId, data: { ...applied }, user_id: userId });
  });

  async function runDeferred() {
    for (const work of deferred.splice(0)) await work();
  }

  it("saves a new status with today's date and records the change", async () => {
    const result = await updateApplication(applicationId, { status: "interview", nextStep: "Prepare for Tuesday" });

    const expected = { ...applied, status: "interview", nextStep: "Prepare for Tuesday", date: "2026-10-22" };
    expect(result).toEqual({ ok: true, application: expected });
    expect(tables.applications[0].data).toEqual(expected);
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");

    await runDeferred();
    expect(track).toHaveBeenCalledWith("tracker.status_changed", { from: "applied", to: "interview" }, { userId });
  });

  it("keeps the date and records no event when only the next step changes", async () => {
    const result = await updateApplication(applicationId, { status: "applied", nextStep: "  Follow up on Friday  " });

    expect(result).toEqual({ ok: true, application: { ...applied, nextStep: "Follow up on Friday" } });
    await runDeferred();
    expect(track).not.toHaveBeenCalled();
  });

  it("saves an empty next step as none", async () => {
    tables.applications[0].data = { ...applied, nextStep: "Call back" };

    const result = await updateApplication(applicationId, { status: "applied", nextStep: "   " });

    expect(result.ok && result.application.nextStep).toBeNull();
  });

  it("writes nothing when nothing changed", async () => {
    const result = await updateApplication(applicationId, { status: "applied", nextStep: "" });

    expect(result).toEqual({ ok: true, application: applied });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(deferred).toHaveLength(0);
  });

  it("does not find an application from another account", async () => {
    const othersId = "b8f5d3c2-1e4a-4f6b-8c7d-2e3f4a5b6c7d";
    tables.applications.push({ id: othersId, job_id: othersJobId, data: { ...applied, id: othersId }, user_id: "user-2" });

    const result = await updateApplication(othersId, { status: "offer", nextStep: "" });

    expect(result).toMatchObject({ ok: false, reason: "not-found" });
    expect(tables.applications[1].data).toMatchObject({ status: "applied" });
  });

  it("refuses a status or next step outside the contract", async () => {
    for (const change of [{ status: "hired", nextStep: "" }, { status: "applied", nextStep: "x".repeat(201) }, { status: "applied" }, "interview", null]) {
      expect(await updateApplication(applicationId, change)).toMatchObject({ ok: false, reason: "invalid" });
    }
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("refuses anything that is not an application id", async () => {
    for (const value of [undefined, 42, "sara-application-1", ""]) {
      expect(await updateApplication(value, { status: "offer", nextStep: "" })).toMatchObject({ ok: false, reason: "not-found" });
    }
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("asks a signed-out visitor to sign in", async () => {
    getCurrentUser.mockResolvedValue(null);

    expect(await updateApplication(applicationId, { status: "offer", nextStep: "" })).toMatchObject({ ok: false, reason: "signed-out" });
    expect(tables.applications[0].data).toEqual(applied);
  });

  it("says so when Supabase is not connected yet", async () => {
    createSupabaseServerClient.mockResolvedValue(null);

    expect(await updateApplication(applicationId, { status: "offer", nextStep: "" })).toMatchObject({ ok: false, reason: "not-connected" });
  });

  it("reports a database error without logging what the user wrote", async () => {
    createSupabaseServerClient.mockImplementation(async () => fakeSupabase(tables, userId, { failUpdate: true }));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await updateApplication(applicationId, { status: "offer", nextStep: "Negotiate the start date" });

    expect(result).toMatchObject({ ok: false, reason: "failed" });
    expect(consoleError).toHaveBeenCalledWith("tracker: could not update the tracker (42501)");
    expect(deferred).toHaveLength(0);
    consoleError.mockRestore();
  });

  it("keeps the follow-ups the user recorded", async () => {
    const followUps = [{ kind: "follow-up" as const, date: "2026-10-20" }];
    tables.applications[0].data = { ...applied, followUps };

    const result = await updateApplication(applicationId, { status: "interview", nextStep: "" });

    expect(tables.applications[0].data).toEqual({ ...applied, status: "interview", date: "2026-10-22", followUps });
    expect(result.ok && result.application.followUps).toEqual(followUps);
  });
});

describe("closeWithoutNews", () => {
  // Version 4 uuids, as the applications table gives.
  const uuid = (n: number) => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
  const saved = (n: number, status: Application["status"], date: string): Application => ({ id: uuid(n), jobId: `job-${n}`, date, status, nextStep: null });
  const add = (...applications: Record<string, unknown>[]) => {
    for (const data of applications) tables.applications.push({ id: data.id, job_id: data.jobId, data: structuredClone(data), user_id: userId });
  };
  const dataOf = (id: string) => tables.applications.find((row) => row.id === id)?.data;

  async function runDeferred() {
    for (const work of deferred.splice(0)) await work();
  }

  beforeEach(() => {
    // Sunday 25 October 2026, midday in London.
    vi.setSystemTime(new Date("2026-10-25T12:00:00Z"));
  });

  it("closes only the ticked rows as No response today, and keeps the rest of their data", async () => {
    const firstInContract: Application = {
      ...saved(1, "applied", "2026-08-01"),
      nextStep: "Chase the recruiter",
      followUps: [{ kind: "follow-up", date: "2026-08-15" }],
    };
    // A field a later version of the contract might add: it stays in the saved data too.
    const first = { ...firstInContract, addedLater: { kept: true } };
    const second = saved(2, "interview", "2026-07-20");
    const notTicked = saved(3, "applied", "2026-08-02");
    add(first, second, notTicked);

    const result = await closeWithoutNews([uuid(1), uuid(2)]);

    expect(result).toEqual({
      ok: true,
      closed: [
        { ...firstInContract, status: "no_response", date: "2026-10-25" },
        { ...second, status: "no_response", date: "2026-10-25" },
      ],
    });
    expect(dataOf(uuid(1))).toEqual({ ...first, status: "no_response", date: "2026-10-25" });
    expect(dataOf(uuid(2))).toEqual({ ...second, status: "no_response", date: "2026-10-25" });
    expect(dataOf(uuid(3))).toEqual(notTicked);
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");

    await runDeferred();
    // The count only: no ids, jobs or companies.
    expect(track).toHaveBeenCalledExactlyOnceWith("tracker.bulk_closed", { count: 2 }, { userId });
  });

  it("never closes a ready, offer or closed row, or one with news in the last 60 days, whatever is posted", async () => {
    const old = "2025-01-01";
    const rows = [
      saved(1, "ready", old),
      saved(2, "offer", old),
      saved(3, "accepted", old),
      saved(4, "rejected", old),
      saved(5, "no_response", old),
      saved(6, "withdrawn", old),
      saved(7, "applied", "2026-08-27"), // 59 days
      saved(8, "interview", "2026-08-26"), // 60 days
    ];
    add(...rows);

    const result = await closeWithoutNews(rows.map((row) => row.id));

    expect(result).toEqual({ ok: true, closed: [{ ...rows[7], status: "no_response", date: "2026-10-25" }] });
    for (const row of rows.slice(0, 7)) expect(dataOf(row.id)).toEqual(row);
    await runDeferred();
    expect(track).toHaveBeenCalledExactlyOnceWith("tracker.bulk_closed", { count: 1 }, { userId });
  });

  it("writes nothing and records nothing when no posted row can be closed", async () => {
    const ready = saved(1, "ready", "2025-01-01");
    add(ready);

    expect(await closeWithoutNews([uuid(1)])).toEqual({ ok: true, closed: [] });
    expect(dataOf(uuid(1))).toEqual(ready);
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(deferred).toHaveLength(0);
  });

  it("writes nothing without the user's choice", async () => {
    const stale = saved(1, "applied", "2026-01-01");
    add(stale);
    const tooMany = Array.from({ length: 101 }, () => uuid(1));

    for (const value of [[], undefined, null, uuid(1), { ids: [uuid(1)] }, ["sara-application-1"], tooMany]) {
      expect(await closeWithoutNews(value)).toMatchObject({ ok: false, reason: "invalid" });
    }
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
    expect(dataOf(uuid(1))).toEqual(stale);
    expect(deferred).toHaveLength(0);
  });

  it("draws the 60-day line at midnight in London, on the day the clocks go back", async () => {
    add(saved(1, "applied", "2026-08-26"), saved(2, "applied", "2026-08-27"));

    // 00:30 in London on 25 October (British Summer Time), still the 24th in UTC: the first has 60 days.
    vi.setSystemTime(new Date("2026-10-24T23:30:00Z"));
    expect(await closeWithoutNews([uuid(1)])).toMatchObject({ ok: true, closed: [{ id: uuid(1), date: "2026-10-25" }] });

    // 23:30 in London on 25 October, after the clocks went back: the second still has 59 days.
    vi.setSystemTime(new Date("2026-10-25T23:30:00Z"));
    expect(await closeWithoutNews([uuid(2)])).toEqual({ ok: true, closed: [] });

    // Midnight in London: 60 days.
    vi.setSystemTime(new Date("2026-10-26T00:00:00Z"));
    expect(await closeWithoutNews([uuid(2)])).toMatchObject({ ok: true, closed: [{ id: uuid(2), date: "2026-10-26" }] });
  });

  it("does not reach another account's applications", async () => {
    const others = saved(1, "applied", "2026-01-01");
    tables.applications.push({ id: others.id, job_id: others.jobId, data: { ...others }, user_id: "user-2" });

    expect(await closeWithoutNews([uuid(1)])).toEqual({ ok: true, closed: [] });
    expect(dataOf(uuid(1))).toEqual(others);
  });

  it("asks a signed-out visitor to sign in, and says so when Supabase is not connected yet", async () => {
    const stale = saved(1, "applied", "2026-01-01");
    add(stale);

    getCurrentUser.mockResolvedValueOnce(null);
    expect(await closeWithoutNews([uuid(1)])).toMatchObject({ ok: false, reason: "signed-out" });
    createSupabaseServerClient.mockResolvedValueOnce(null);
    expect(await closeWithoutNews([uuid(1)])).toMatchObject({ ok: false, reason: "not-connected" });

    expect(dataOf(uuid(1))).toEqual(stale);
    expect(deferred).toHaveLength(0);
  });

  it("reports a database error with the code only and records nothing", async () => {
    add(saved(1, "applied", "2026-01-01"));
    createSupabaseServerClient.mockImplementation(async () => fakeSupabase(tables, userId, { failUpdate: true }));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await closeWithoutNews([uuid(1)])).toMatchObject({ ok: false, reason: "failed" });
    expect(consoleError).toHaveBeenCalledExactlyOnceWith("tracker: could not update the tracker (42501)");
    expect(deferred).toHaveLength(0);
    expect(revalidatePath).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
