import "server-only";
import { connection } from "next/server";
import { cache } from "react";
import type { z } from "zod";
import { getCurrentUser } from "@/features/account/current-user";
import { JobSchema, MatchResultSchema, ProfileSchema, type Job, type MatchResult, type Profile } from "@/shared/contracts";
import { personas, type PersonaName } from "@/shared/sample-data";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { assessByRules, buildMatchResult } from "./match";
import type { SupabaseServerClient } from "./server/job-store";

// The signed-in user's own Profile, jobs and matches, for every part of the app (Tailor, Interview, Dashboard…).
// Server only. Row-level security limits each user to their own rows, and every row is checked against its contract.
// When Supabase isn't connected or nobody is signed in, they answer with a sample persona instead, so pages keep working.
// They read cookies: call them inside a component wrapped in <Suspense>, a Server Action or a Route Handler.

/** Where the answers come from: the signed-in user's account, or the sample personas. */
export type DataSource = "account" | "sample";

/** The most jobs listMyJobs() returns, newest first. */
export const MAX_LISTED_JOBS = 100;

type Account = { source: "account"; supabase: SupabaseServerClient } | { source: "sample" };

/** Who is asking, worked out once per request however many of these functions a page calls. */
const getAccount = cache(async (): Promise<Account> => {
  // Reading the session checks the token's expiry against the clock, so it must never run while Next.js
  // prerenders a page ahead of time: connection() keeps everything after it for the real request.
  await connection();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { source: "sample" };
  return (await getCurrentUser()) ? { source: "account", supabase } : { source: "sample" };
});

/** "account" for a signed-in user, "sample" when the functions below answer with sample data. */
export async function getMyDataSource(): Promise<DataSource> {
  return (await getAccount()).source;
}

/**
 * The user's approved Profile, or null if they haven't saved one yet.
 * Sample data: the profile of the persona who owns `jobId` (Sara for any other id), so it matches getMyJob(jobId).
 */
export async function getMyProfile(options: { jobId?: string } = {}): Promise<Profile | null> {
  const account = await getAccount();
  if (account.source === "sample") return personas[sampleFor(options.jobId).persona].profile;

  const { data, error } = await account.supabase.from("profiles").select("data").maybeSingle();
  if (error) return failed("profile", error);
  return data ? parsed(ProfileSchema, data.data, "profile") : null;
}

/** The user's jobs, newest first. Sample data: Sara's two jobs. */
export async function listMyJobs(): Promise<Job[]> {
  const account = await getAccount();
  if (account.source === "sample") return personas.sara.jobs;

  const { data, error } = await account.supabase
    .from("jobs")
    .select("id, data")
    .order("created_at", { ascending: false })
    .limit(MAX_LISTED_JOBS);
  if (error) return failed("jobs", error) ?? [];
  return (data ?? []).flatMap((row: { id: string; data: unknown }) => jobFromRow(row) ?? []);
}

/**
 * One of the user's jobs, or null if they have none with that id.
 * Sample data: the sample job with that id (for example "reza-job-1"), or Sara's first job for any other id.
 */
export async function getMyJob(jobId: string): Promise<Job | null> {
  const account = await getAccount();
  if (account.source === "sample") return sampleFor(jobId).job;
  if (!isUuid(jobId)) return null;

  const { data, error } = await account.supabase.from("jobs").select("id, data").eq("id", jobId).maybeSingle();
  if (error) return failed("job", error);
  return data ? jobFromRow(data) : null;
}

/**
 * The latest match for one of the user's jobs, or null if there is none.
 * Sample data: the persona's match for the same sample job as getMyJob(jobId).
 */
export async function getMyMatch(jobId: string): Promise<MatchResult | null> {
  const account = await getAccount();
  if (account.source === "sample") return sampleMatch(jobId);
  if (!isUuid(jobId)) return null;

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

/** The sample persona and job for an id: the sample job with that id, or Sara's first job. */
function sampleFor(jobId: string | undefined): { persona: PersonaName; job: Job } {
  for (const persona of Object.keys(personas) as PersonaName[]) {
    const job = personas[persona].jobs.find((candidate) => candidate.id === jobId);
    if (job) return { persona, job };
  }
  return { persona: "sara", job: personas.sara.jobs[0] };
}

/** Each persona has a written match for their first job; the second job is matched by the same rules as the demo. */
function sampleMatch(jobId: string): MatchResult {
  const { persona, job } = sampleFor(jobId);
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
