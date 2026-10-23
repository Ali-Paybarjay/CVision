import "server-only";
import type { Job, MatchResult, Profile } from "@/shared/contracts";
import { personas, type PersonaName } from "@/shared/sample-data";

// The sample user until Shayan's server reads land (#48). Same names, signatures and sample behaviour as his
// functions in src/features/profile/my-data.ts, so my-data.ts swaps them in one line: the persona who owns the
// job id answers, and any other id falls back to Sara's first job.

/** Where the answers come from: the signed-in user's account, or the sample personas. */
export type DataSource = "account" | "sample";

export async function getMyDataSource(): Promise<DataSource> {
  return "sample";
}

export async function getMyProfile(options: { jobId?: string } = {}): Promise<Profile | null> {
  return personas[sampleFor(options.jobId).persona].profile;
}

export async function listMyJobs(): Promise<Job[]> {
  return personas.sara.jobs;
}

export async function getMyJob(jobId: string): Promise<Job | null> {
  return sampleFor(jobId).job;
}

/** Each persona has a written match for their first job only; Shayan's version also matches the second. */
export async function getMyMatch(jobId: string): Promise<MatchResult | null> {
  const { persona, job } = sampleFor(jobId);
  const { match } = personas[persona];
  return match.jobId === job.id ? match : null;
}

function sampleFor(jobId: string | undefined): { persona: PersonaName; job: Job } {
  for (const persona of Object.keys(personas) as PersonaName[]) {
    const job = personas[persona].jobs.find((candidate) => candidate.id === jobId);
    if (job) return { persona, job };
  }
  return { persona: "sara", job: personas.sara.jobs[0] };
}
