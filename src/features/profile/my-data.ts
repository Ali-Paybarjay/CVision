import "server-only";
import { cache } from "react";
import type { z } from "zod";
import { getCurrentUser } from "@/features/account/current-user";
import { getAiMode } from "@/shared/ai";
import { JobSchema, MatchResultSchema, ProfileSchema, type Job, type MatchResult, type Profile } from "@/shared/contracts";
import { personas, type PersonaName } from "@/shared/sample-data";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { assessByRules, buildMatchResult } from "./match";
import type { SupabaseServerClient } from "./server/job-store";

// The signed-in user's own Profile, jobs and matches, for every part of the app (Tailor, Interview, Dashboard…).
// Server only. Row-level security limits each user to their own rows, and every row is checked against its contract.
// When Supabase isn't connected, or in the demo (mock AI) when nobody is signed in, they answer with a sample persona,
// so pages keep working. On the live site a signed-out visitor gets nothing: never a sample persona's profile and jobs
// shown as their own. They read cookies: call them inside a component wrapped in <Suspense>, a Server Action or a
// Route Handler.

/** Where the answers come from: the signed-in user's account, the sample personas, or nowhere (signed out, live). */
export type DataSource = "account" | "sample" | "none";

/** The most jobs listMyJobs() returns, newest first. */
export const MAX_LISTED_JOBS = 100;

type Account = { source: "account"; supabase: SupabaseServerClient } | { source: "sample" } | { source: "none" };

/** Who is asking, worked out once per request however many of these functions a page calls. */
const getAccount = cache(async (): Promise<Account> => {
  // No connection() here: createSupabaseServerClient awaits io() before it reads the session (#78), so the session
  // is never read while Next.js prerenders, and teammates' tests that replace next/server keep working.
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { source: "sample" };
  if (await getCurrentUser()) return { source: "account", supabase };
  // Signed out on the live site: Tailor once showed Sara's CV to a visitor as "Your CV for this job". The demo keeps
  // its sample data, as no model is asked there.
  return getAiMode() === "mock" ? { source: "sample" } : { source: "none" };
});

/** "account" for a signed-in user, "sample" when the functions below answer with sample data, "none" otherwise. */
export async function getMyDataSource(): Promise<DataSource> {
  return (await getAccount()).source;
}

/**
 * The user's approved Profile, or null if they haven't saved one yet.
 * Sample data: the profile of the persona who owns `jobId`, so it matches getMyJob(jobId), or Sara's for any other id.
 */
export async function getMyProfile(options: { jobId?: string } = {}): Promise<Profile | null> {
  const account = await getAccount();
  if (account.source === "sample") return personas[sampleJob(options.jobId)?.persona ?? "sara"].profile;
  if (account.source === "none") return null;

  const { data, error } = await account.supabase.from("profiles").select("data").maybeSingle();
  if (error) return failed("profile", error);
  return data ? parsed(ProfileSchema, data.data, "profile") : null;
}

/** The user's jobs, newest first. Sample data: Sara's two jobs. */
export async function listMyJobs(): Promise<Job[]> {
  const account = await getAccount();
  if (account.source === "sample") return personas.sara.jobs;
  if (account.source === "none") return [];

  const { data, error } = await account.supabase
    .from("jobs")
    .select("id, data")
    .order("created_at", { ascending: false })
    .limit(MAX_LISTED_JOBS);
  if (error) return failed("jobs", error) ?? [];
  return (data ?? []).flatMap((row: { id: string; data: unknown }) => jobFromRow(row) ?? []);
}

/**
 * The ids of the user's jobs that are on their dashboard because they applied for them. A list of jobs offers to
 * delete only the others (#462); deleteJobAction refuses these too, so a failed read here only shows a button too many.
 * Sample data and signed-out visitors: none.
 */
export async function listMyJobIdsOnDashboard(): Promise<string[]> {
  const account = await getAccount();
  if (account.source !== "account") return [];

  const { data, error } = await account.supabase.from("applications").select("job_id");
  if (error) return failed("applications", error) ?? [];
  return (data ?? []).map((row: { job_id: string }) => row.job_id);
}

/**
 * One of the user's jobs, or null if they have none with that id.
 * Sample data: the sample job with that id (for example "reza-job-1"), or null for any other id, so a wrong or old link
 * says the job can't be found instead of opening Sara's job (Nazanin's note on #93).
 */
export async function getMyJob(jobId: string): Promise<Job | null> {
  const account = await getAccount();
  if (account.source === "sample") return sampleJob(jobId)?.job ?? null;
  if (account.source === "none" || !isUuid(jobId)) return null;

  const { data, error } = await account.supabase.from("jobs").select("id, data").eq("id", jobId).maybeSingle();
  if (error) return failed("job", error);
  return data ? jobFromRow(data) : null;
}

/**
 * The latest match for one of the user's jobs, or null if there is none.
 * Sample data: the persona's match for the same sample job as getMyJob(jobId), or null for any other id.
 */
export async function getMyMatch(jobId: string): Promise<MatchResult | null> {
  const account = await getAccount();
  if (account.source === "sample") {
    const sample = sampleJob(jobId);
    return sample && sampleMatch(sample);
  }
  if (account.source === "none" || !isUuid(jobId)) return null;

  const { data, error } = await account.supabase
    .from("match_results")
    .select("data")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return failed("match", error);
  const match = data ? parsed(MatchResultSchema, data.data, "match") : null;
  return match && { ...match, jobId };
}

type SampleJob = { persona: PersonaName; job: Job };

/** The sample persona and job with that id, or null when no sample job has it. */
function sampleJob(jobId: string | undefined): SampleJob | null {
  for (const persona of Object.keys(personas) as PersonaName[]) {
    const job = personas[persona].jobs.find((candidate) => candidate.id === jobId);
    if (job) return { persona, job };
  }
  return null;
}

/** Each persona has a written match for their first job; the second job is matched by the same rules as the demo. */
function sampleMatch({ persona, job }: SampleJob): MatchResult {
  const { profile, match } = personas[persona];
  return match.jobId === job.id ? match : buildMatchResult(job, profile, assessByRules(profile, job)).match;
}

/** A jobs row as a Job. The row id is the job's id, whatever the stored data says. */
function jobFromRow(row: { id: string; data: unknown }): Job | null {
  const job = parsed(JobSchema, row.data, "job");
  return job && { ...job, id: row.id };
}

function parsed<S extends z.ZodType>(schema: S, value: unknown, what: string): z.output<S> | null {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  // Log where the row is wrong, never its content.
  console.error(`profile: a saved ${what} doesn't match its contract:`, result.error.issues.slice(0, 3).map((issue) => issue.path.join(".")));
  return null;
}

function failed(what: string, error: { message: string }): null {
  console.error(`profile: could not read the ${what}:`, error.message);
  return null;
}

function isUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
