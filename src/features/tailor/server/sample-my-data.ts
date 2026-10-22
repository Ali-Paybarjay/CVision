import "server-only";
import type { Job, MatchResult, Profile } from "@/shared/contracts";
import { personas } from "@/shared/sample-data";

// The sample user until Shayan's server reads land (#48): Sara, with her two jobs. Same names and shapes as
// his functions, so my-data.ts swaps them in one line. Only her first job has a MatchResult.
const sample = personas.sara;

export async function getMyProfile(): Promise<Profile | null> {
  return sample.profile;
}

export async function listMyJobs(): Promise<Job[]> {
  return sample.jobs;
}

export async function getMyJob(jobId: string): Promise<Job | null> {
  return sample.jobs.find((job) => job.id === jobId) ?? null;
}

export async function getMyMatch(jobId: string): Promise<MatchResult | null> {
  return sample.match.jobId === jobId ? sample.match : null;
}
