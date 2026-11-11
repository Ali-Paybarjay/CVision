import { describe, expect, it, vi } from "vitest";
import { personas } from "@/shared/sample-data";
import { deleteJob, saveJobAndMatch, type SupabaseServerClient } from "./job-store";

const job = personas.sara.jobs[0];
const match = personas.sara.match;

/** A stand-in for the Supabase client that records each insert and delete. */
function fakeSupabase(errors: { jobs?: string; match_results?: string } = {}) {
  const calls: Array<[string, string, unknown]> = [];
  const client = {
    from(table: "jobs" | "match_results") {
      return {
        insert: async (row: unknown) => {
          calls.push([table, "insert", row]);
          return { error: errors[table] ? { message: errors[table] } : null };
        },
        delete: () => ({
          eq: async (column: string, value: string) => {
            calls.push([table, "delete", { [column]: value }]);
            return { error: null };
          },
        }),
      };
    },
  };
  return { client: client as unknown as SupabaseServerClient, calls };
}

describe("saveJobAndMatch", () => {
  it("saves the job under its own id, then its match", async () => {
    const { client, calls } = fakeSupabase();

    expect(await saveJobAndMatch(client, job, match)).toBe(true);
    expect(calls).toEqual([
      ["jobs", "insert", { id: job.id, data: job }],
      ["match_results", "insert", { job_id: job.id, data: match }],
    ]);
  });

  it("doesn't save the match when the job could not be saved", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client, calls } = fakeSupabase({ jobs: "permission denied" });

    expect(await saveJobAndMatch(client, job, match)).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it("removes the job again when its match could not be saved", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client, calls } = fakeSupabase({ match_results: "timeout" });

    expect(await saveJobAndMatch(client, job, match)).toBe(false);
    expect(calls.at(-1)).toEqual(["jobs", "delete", { id: job.id }]);
  });
});

/** A stand-in for the two requests deleteJob makes: the job's application, if any, then deleting the job. */
function deletingSupabase(
  replies: { applications?: unknown[]; deleted?: unknown[]; readError?: string; deleteError?: string } = {},
) {
  const calls: string[] = [];
  const client = {
    from(table: string) {
      return {
        select: (columns: string) => ({
          eq: (column: string, value: string) => ({
            limit: async (count: number) => {
              calls.push(`${table}: select ${columns} where ${column} = ${value} limit ${count}`);
              return replies.readError ? { data: null, error: { message: replies.readError } } : { data: replies.applications ?? [], error: null };
            },
          }),
        }),
        delete: () => ({
          eq: (column: string, value: string) => ({
            select: async (columns: string) => {
              calls.push(`${table}: delete where ${column} = ${value}, returning ${columns}`);
              return replies.deleteError ? { data: null, error: { message: replies.deleteError } } : { data: replies.deleted ?? [], error: null };
            },
          }),
        }),
      };
    },
  };
  return { client: client as unknown as SupabaseServerClient, calls };
}

describe("deleteJob", () => {
  const jobId = "00000000-0000-4000-8000-000000000001";

  it("deletes a job the user hasn't applied for, after checking the dashboard", async () => {
    const { client, calls } = deletingSupabase({ deleted: [{ id: jobId }] });

    expect(await deleteJob(client, jobId)).toBe("deleted");
    expect(calls).toEqual([
      `applications: select id where job_id = ${jobId} limit 1`,
      `jobs: delete where id = ${jobId}, returning id`,
    ]);
  });

  it("keeps a job that is on the dashboard, and deletes nothing", async () => {
    const { client, calls } = deletingSupabase({ applications: [{ id: "application-1" }] });

    expect(await deleteJob(client, jobId)).toBe("on-dashboard");
    expect(calls).toHaveLength(1);
  });

  it("says not-found when no row went: another account's job, or one already deleted", async () => {
    const { client } = deletingSupabase({ deleted: [] });

    expect(await deleteJob(client, jobId)).toBe("not-found");
  });

  it("deletes nothing when it can't tell whether the job is on the dashboard", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client, calls } = deletingSupabase({ readError: "timeout" });

    expect(await deleteJob(client, jobId)).toBe("failed");
    expect(calls).toHaveLength(1);
  });

  it("says failed when the database couldn't delete the job", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = deletingSupabase({ deleteError: "permission denied" });

    expect(await deleteJob(client, jobId)).toBe("failed");
  });
});
