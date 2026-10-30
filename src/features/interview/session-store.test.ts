import { afterEach, describe, expect, it, vi } from "vitest";
import { listPracticeSummaries, loadLatestReport } from "./server/session-store";
import { fixtures } from "./fixtures";
import { runMockSession } from "./test-support";

// A fake of the few query calls the store makes: it records the filters and answers with `rows.value`.
const rows = vi.hoisted(() => ({ value: [] as Record<string, unknown>[] | null, error: null as { code: string } | null }));
const calls = vi.hoisted(() => [] as unknown[][]);
const connected = vi.hoisted(() => ({ value: true }));
vi.mock("@/shared/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    if (!connected.value) return null;
    const query = {
      select: (...args: unknown[]) => (calls.push(["select", ...args]), query),
      eq: (...args: unknown[]) => (calls.push(["eq", ...args]), query),
      not: (...args: unknown[]) => (calls.push(["not", ...args]), query),
      order: (...args: unknown[]) => (calls.push(["order", ...args]), query),
      limit: () => query,
      maybeSingle: async () => ({ data: rows.value?.[0] ?? null, error: rows.error }),
      then: (resolve: (result: unknown) => unknown) => resolve({ data: rows.value, error: rows.error }),
    };
    return { from: () => query };
  },
}));

const jobId = "6f1c2a8e-3b4d-4c5e-9f60-7a8b9c0d1e2f";
const otherJobId = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

afterEach(() => {
  rows.value = [];
  rows.error = null;
  calls.length = 0;
  connected.value = true;
});

describe("loading a job's last report (#206)", () => {
  it("asks only for sessions with a report and returns the session with its date", async () => {
    const session = await runMockSession(fixtures[0]);
    rows.value = [{ data: session, updated_at: "2026-10-26T18:00:00+00:00" }];

    expect(await loadLatestReport(jobId)).toEqual({ session, practisedAt: "2026-10-26T18:00:00+00:00" });
    expect(calls).toContainEqual(["eq", "job_id", jobId]);
    expect(calls).toContainEqual(["not", "data->report", "is", null]);
  });

  it("is null for a sample job, without Supabase, on an error, or for a row without a valid report", async () => {
    const session = await runMockSession(fixtures[0]);
    expect(await loadLatestReport("sara-job-1")).toBeNull();

    rows.value = [{ data: { ...session, report: undefined }, updated_at: "2026-10-26T18:00:00+00:00" }];
    expect(await loadLatestReport(jobId)).toBeNull();

    rows.value = [{ data: { id: "broken" }, updated_at: "2026-10-26T18:00:00+00:00" }];
    expect(await loadLatestReport(jobId)).toBeNull();

    rows.error = { code: "PGRST000" };
    expect(await loadLatestReport(jobId)).toBeNull();

    connected.value = false;
    expect(await loadLatestReport(jobId)).toBeNull();
  });
});

describe("listing the latest practice of each job (#206)", () => {
  it("keeps the newest finished practice per job and reads only the job, date and score", async () => {
    rows.value = [
      { job_id: jobId, updated_at: "2026-10-28T10:00:00+00:00", overall: 3.4 },
      { job_id: otherJobId, updated_at: "2026-10-27T10:00:00+00:00", overall: 4 },
      { job_id: jobId, updated_at: "2026-10-26T10:00:00+00:00", overall: 2.1 },
      { job_id: "bad", updated_at: "2026-10-25T10:00:00+00:00", overall: "high" },
    ];

    expect(await listPracticeSummaries()).toEqual([
      { jobId, practisedAt: "2026-10-28T10:00:00+00:00", overall: 3.4 },
      { jobId: otherJobId, practisedAt: "2026-10-27T10:00:00+00:00", overall: 4 },
    ]);
    expect(calls).toContainEqual(["select", "job_id, updated_at, overall:data->report->overall"]);
    expect(calls).toContainEqual(["order", "updated_at", { ascending: false }]);
  });

  it("is empty without Supabase or on an error", async () => {
    rows.error = { code: "PGRST000" };
    expect(await listPracticeSummaries()).toEqual([]);
    connected.value = false;
    expect(await listPracticeSummaries()).toEqual([]);
  });
});
