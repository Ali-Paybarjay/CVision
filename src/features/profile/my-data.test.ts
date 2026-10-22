import { connection } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { personas } from "@/shared/sample-data";
import { profileEvidenceLines } from "./match";
import { getMyDataSource, getMyJob, getMyMatch, getMyProfile, listMyJobs, MAX_LISTED_JOBS } from "./my-data";

const { getCurrentUser, createSupabaseServerClient } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  createSupabaseServerClient: vi.fn(),
}));
vi.mock("@/features/account/current-user", () => ({ getCurrentUser }));
vi.mock("@/shared/supabase/server", () => ({ createSupabaseServerClient }));
// Outside a real request connection() throws, so the tests stand in for one.
vi.mock("next/server", () => ({ connection: vi.fn(async () => undefined) }));

type Row = Record<string, unknown>;

/**
 * A stand-in for the Supabase client: each table holds the signed-in user's rows (row-level security is the
 * database's job), and the query methods the functions use filter, sort and cut them like Postgres would.
 */
function fakeSupabase(tables: Record<string, Row[]>, error: string | null = null) {
  const queries: Array<{ table: string; steps: string[] }> = [];
  const client = {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      const query = { table, steps: [] as string[] };
      queries.push(query);
      const reply = (data: unknown) => Promise.resolve(error ? { data: null, error: { message: error } } : { data, error: null });
      const builder = {
        select(columns: string) {
          query.steps.push(`select ${columns}`);
          return builder;
        },
        eq(column: string, value: unknown) {
          query.steps.push(`eq ${column}`);
          rows = rows.filter((row) => row[column] === value);
          return builder;
        },
        order(column: string, { ascending }: { ascending: boolean }) {
          query.steps.push(`order ${column} ${ascending ? "asc" : "desc"}`);
          rows.sort((a, b) => String(a[column]).localeCompare(String(b[column])) * (ascending ? 1 : -1));
          return builder;
        },
        limit(count: number) {
          query.steps.push(`limit ${count}`);
          rows = rows.slice(0, count);
          return builder;
        },
        maybeSingle: () => reply(rows[0] ?? null),
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => reply(rows).then(resolve, reject),
      };
      return builder;
    },
  };
  return { client, queries };
}

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const { profile, jobs, match } = personas.emma;

beforeEach(() => {
  getCurrentUser.mockResolvedValue({ id: "user-1", email: null });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("reading the session", () => {
  it("waits for the real request first, so it never runs while Next.js prerenders a page", async () => {
    createSupabaseServerClient.mockResolvedValue(null);

    await getMyProfile();

    expect(connection).toHaveBeenCalledTimes(1);
    expect(vi.mocked(connection).mock.invocationCallOrder[0]).toBeLessThan(createSupabaseServerClient.mock.invocationCallOrder[0]);
  });
});

describe("with no account (Supabase not connected, or signed out)", () => {
  it.each([
    ["Supabase is not connected", () => createSupabaseServerClient.mockResolvedValue(null)],
    ["nobody is signed in", () => {
      createSupabaseServerClient.mockResolvedValue(fakeSupabase({}).client);
      getCurrentUser.mockResolvedValue(null);
    }],
  ])("answers with sample data when %s", async (_, setUp) => {
    setUp();

    expect(await getMyDataSource()).toBe("sample");
    expect(await getMyProfile()).toBe(personas.sara.profile);
    expect(await listMyJobs()).toEqual(personas.sara.jobs);
    expect(await getMyJob("anything")).toBe(personas.sara.jobs[0]);
    expect(await getMyMatch("anything")).toBe(personas.sara.match);
  });

  it("keeps the profile, job and match of one sample persona together", async () => {
    createSupabaseServerClient.mockResolvedValue(null);

    expect(await getMyJob("reza-job-2")).toBe(personas.reza.jobs[1]);
    expect(await getMyProfile({ jobId: "reza-job-2" })).toBe(personas.reza.profile);
    expect((await getMyMatch("reza-job-1"))).toBe(personas.reza.match);
  });

  it("matches a persona's second job by rules, quoting only that persona's profile", async () => {
    createSupabaseServerClient.mockResolvedValue(null);

    const second = await getMyMatch("daniel-job-2");

    expect(second?.jobId).toBe("daniel-job-2");
    const lines = profileEvidenceLines(personas.daniel.profile).map((line) => line.text);
    for (const strength of second?.strengths ?? []) expect(lines).toContain(strength.evidence);
  });
});

describe("for a signed-in user", () => {
  it("reads their profile", async () => {
    const { client } = fakeSupabase({ profiles: [{ data: profile }] });
    createSupabaseServerClient.mockResolvedValue(client);

    expect(await getMyDataSource()).toBe("account");
    expect(await getMyProfile()).toEqual(profile);
  });

  it("answers null when they haven't saved a profile yet, never someone else's", async () => {
    createSupabaseServerClient.mockResolvedValue(fakeSupabase({ profiles: [] }).client);

    expect(await getMyProfile()).toBeNull();
  });

  it("lists their jobs newest first, with each row's id", async () => {
    const { client, queries } = fakeSupabase({
      jobs: [
        { id: id(1), created_at: "2026-10-20T10:00:00Z", data: jobs[0] },
        { id: id(2), created_at: "2026-10-21T10:00:00Z", data: jobs[1] },
      ],
    });
    createSupabaseServerClient.mockResolvedValue(client);

    const list = await listMyJobs();

    expect(list.map((job) => [job.id, job.title])).toEqual([
      [id(2), jobs[1].title],
      [id(1), jobs[0].title],
    ]);
    expect(queries[0].steps).toEqual(["select id, data", "order created_at desc", `limit ${MAX_LISTED_JOBS}`]);
  });

  it("skips a saved job that no longer matches the contract", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeSupabase({
      jobs: [
        { id: id(1), created_at: "1", data: { title: "Broken" } },
        { id: id(2), created_at: "2", data: jobs[0] },
      ],
    });
    createSupabaseServerClient.mockResolvedValue(client);

    expect((await listMyJobs()).map((job) => job.id)).toEqual([id(2)]);
  });

  it("reads one job and its latest match", async () => {
    const older = { ...match, score: 40 };
    const { client } = fakeSupabase({
      jobs: [{ id: id(7), data: jobs[0] }],
      match_results: [
        { job_id: id(7), created_at: "2026-10-20T10:00:00Z", data: older },
        { job_id: id(7), created_at: "2026-10-21T10:00:00Z", data: match },
        { job_id: id(8), created_at: "2026-10-22T10:00:00Z", data: { ...match, score: 99 } },
      ],
    });
    createSupabaseServerClient.mockResolvedValue(client);

    expect(await getMyJob(id(7))).toEqual({ ...jobs[0], id: id(7) });
    expect(await getMyMatch(id(7))).toEqual({ ...match, jobId: id(7) });
  });

  it("answers null for an id that isn't one of their jobs, without asking the database about a malformed one", async () => {
    const { client, queries } = fakeSupabase({ jobs: [], match_results: [] });
    createSupabaseServerClient.mockResolvedValue(client);

    expect(await getMyJob(id(9))).toBeNull();
    expect(await getMyMatch(id(9))).toBeNull();
    expect(await getMyJob("sara-job-1")).toBeNull();
    expect(await getMyMatch("' or 1=1 --")).toBeNull();
    expect(queries).toHaveLength(2);
  });

  it("answers null or an empty list when the database fails, so the page can say so", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    createSupabaseServerClient.mockResolvedValue(fakeSupabase({}, "connection refused").client);

    expect(await getMyProfile()).toBeNull();
    expect(await listMyJobs()).toEqual([]);
    expect(await getMyJob(id(1))).toBeNull();
    expect(await getMyMatch(id(1))).toBeNull();
  });
});
