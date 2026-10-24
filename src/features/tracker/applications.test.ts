import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Application } from "@/shared/contracts";
import { loadTracker } from "./applications";
import { sampleApplications } from "./sample";

const { getCurrentUser, createSupabaseServerClient } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  createSupabaseServerClient: vi.fn(),
}));
vi.mock("@/features/account/current-user", () => ({ getCurrentUser }));
vi.mock("@/shared/supabase/server", () => ({ createSupabaseServerClient }));

type Row = Record<string, unknown>;
type Tables = { jobs: Row[]; applications: Row[] };

/** Just enough of the Supabase client for loadTracker, acting as one user, like row-level security. */
function fakeSupabase(tables: Tables, userId: string, options: { failJobs?: boolean } = {}) {
  return {
    from(table: keyof Tables) {
      let rows = tables[table].filter((row) => row.user_id === userId);
      const query = {
        select: () => query,
        order: (column: string, { ascending }: { ascending: boolean }) => {
          rows = [...rows].sort((a, b) => String(a[column]).localeCompare(String(b[column])) * (ascending ? 1 : -1));
          return query;
        },
        in: (column: string, values: unknown[]) => {
          rows = rows.filter((row) => values.includes(row[column]));
          return query;
        },
        then: (resolve: (value: unknown) => void) =>
          resolve(table === "jobs" && options.failJobs ? { data: null, error: { code: "57014" } } : { data: rows, error: null }),
      };
      return query;
    },
  };
}

const userId = "user-1";
const job = (id: string, title: string, company: string, owner = userId) => ({ id, user_id: owner, data: { title, company } });
const row = (data: Application, createdAt: string, owner = userId) => ({ id: data.id, job_id: data.jobId, user_id: owner, created_at: createdAt, data });

const older: Application = { id: "app-1", jobId: "job-1", date: "2026-10-10", status: "interview", nextStep: "Prepare" };
const newer: Application = { id: "app-2", jobId: "job-2", date: "2026-10-20", status: "applied", nextStep: null };
let tables: Tables;

beforeEach(() => {
  tables = {
    jobs: [job("job-1", "Junior Data Analyst", "Pennine Health Analytics"), job("job-2", "Graduate Data Analyst", "Irwell Energy")],
    applications: [row(older, "2026-10-10T09:00:00Z"), row(newer, "2026-10-20T09:00:00Z")],
  };
  getCurrentUser.mockResolvedValue({ id: userId, email: null });
  createSupabaseServerClient.mockImplementation(async () => fakeSupabase(tables, userId));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("loadTracker", () => {
  it("lists the user's applications newest first, with each job's title and company", async () => {
    expect(await loadTracker()).toEqual({
      kind: "account",
      items: [
        { application: newer, job: { title: "Graduate Data Analyst", company: "Irwell Energy" } },
        { application: older, job: { title: "Junior Data Analyst", company: "Pennine Health Analytics" } },
      ],
    });
  });

  it("shows only the user's own applications", async () => {
    const others: Application = { ...newer, id: "app-3", jobId: "job-3" };
    tables.jobs.push(job("job-3", "Data Engineer", "Elsewhere Ltd", "user-2"));
    tables.applications.push(row(others, "2026-10-21T09:00:00Z", "user-2"));

    const tracker = await loadTracker();

    expect(tracker.kind === "account" && tracker.items.map((item) => item.application.id)).toEqual(["app-2", "app-1"]);
  });

  it("is empty for a new user", async () => {
    tables.applications = [];

    expect(await loadTracker()).toEqual({ kind: "account", items: [] });
  });

  it("skips a row that does not match the contract", async () => {
    tables.applications.push({ id: "app-bad", job_id: "job-1", user_id: userId, created_at: "2026-10-21T09:00:00Z", data: { status: "lost" } });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const tracker = await loadTracker();

    expect(tracker.kind === "account" && tracker.items).toHaveLength(2);
    consoleError.mockRestore();
  });

  it("still shows an application whose job cannot be read", async () => {
    tables.jobs[1].data = { description: "No title or company" };

    const tracker = await loadTracker();

    expect(tracker.kind === "account" && tracker.items[0]).toEqual({ application: newer, job: null });
  });

  it("reports an error when the jobs cannot be read", async () => {
    createSupabaseServerClient.mockImplementation(async () => fakeSupabase(tables, userId, { failJobs: true }));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await loadTracker()).toEqual({ kind: "error" });
    expect(consoleError).toHaveBeenCalledWith("tracker: could not read the jobs (57014)");
    consoleError.mockRestore();
  });

  it("leaves a signed-out visitor to the account panel", async () => {
    getCurrentUser.mockResolvedValue(null);

    expect(await loadTracker()).toEqual({ kind: "signed-out" });
  });

  it("shows Sara's sample applications while Supabase is not connected", async () => {
    createSupabaseServerClient.mockResolvedValue(null);

    expect(await loadTracker()).toEqual({ kind: "sample", items: sampleApplications });
    expect(getCurrentUser).not.toHaveBeenCalled();
  });
});

describe("sampleApplications", () => {
  it("puts Sara's interview fixture first, so its practice link works in mock mode", () => {
    expect(sampleApplications.map(({ application }) => [application.jobId, application.status])).toEqual([
      ["sara-job-1", "interview"],
      ["sara-job-2", "applied"],
    ]);
  });
});
