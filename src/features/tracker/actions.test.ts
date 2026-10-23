import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Application } from "@/shared/contracts";
import { recordApplication } from "./actions";

const { getCurrentUser, createSupabaseServerClient, revalidatePath } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/features/account/current-user", () => ({ getCurrentUser }));
vi.mock("@/shared/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("next/cache", () => ({ revalidatePath }));

type Row = Record<string, unknown>;
type Tables = { jobs: Row[]; applications: Row[] };

/**
 * Just enough of the Supabase client for recordApplication, acting as one user: like row-level security,
 * every read and write sees only that user's rows.
 */
function fakeSupabase(tables: Tables, userId: string, options: { failInsert?: boolean } = {}) {
  const own = (table: keyof Tables) => tables[table].filter((row) => row.user_id === userId);
  return {
    from(table: keyof Tables) {
      const filters: [string, unknown][] = [];
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => (filters.push([column, value]), query),
        order: () => query,
        limit: () => query,
        maybeSingle: async () => ({ data: own(table).find((row) => filters.every(([c, v]) => row[c] === v)) ?? null, error: null }),
        insert: async (row: Row) => {
          if (options.failInsert) return { error: { code: "42501" } };
          tables[table].push({ ...row, user_id: userId });
          return { error: null };
        },
        update: (patch: Row) => ({
          eq: async (column: string, value: unknown) => {
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
