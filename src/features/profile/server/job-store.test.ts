import { describe, expect, it, vi } from "vitest";
import { personas } from "@/shared/sample-data";
import { saveJobAndMatch, type SupabaseServerClient } from "./job-store";

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
