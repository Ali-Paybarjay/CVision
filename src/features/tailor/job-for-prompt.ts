import type { Job } from "@/shared/contracts";

/**
 * The job as the tailor prompts read it. `role` (#398: discipline, specialty, level, registration body) comes along
 * whenever the job reader found one, at no extra cost, so even tailor-propose, which never gets the whole ad, knows
 * the kind of role (#404). Jobs read before the field existed, and mock jobs, simply have no role.
 */
export function jobForPrompt(job: Job, options: { withAd: boolean }): string {
  return JSON.stringify(
    {
      title: job.title,
      company: job.company,
      ...(job.role ? { role: job.role } : {}),
      ...(options.withAd ? { description: job.description } : {}),
      requirements: job.requirements,
    },
    null,
    2,
  );
}
