import Link from "next/link";
import { notFound } from "next/navigation";
import { getMyDataSource, getMyJob } from "@/features/profile/my-data";
import { Card, Page } from "@/shared/ui";

const backLink = "inline-flex min-h-11 items-center self-start text-sm font-semibold text-accent underline underline-offset-4";

/**
 * One job's full ad, as the user pasted it, opened from its row on the dashboard (#208). Only the user's own job:
 * any other id is not found. Reads the session, so render it inside <Suspense>.
 */
export async function JobAd({ jobId }: { jobId: string }) {
  const [job, source] = await Promise.all([getMyJob(jobId), getMyDataSource()]);
  // Row-level security keeps other users' jobs out. Sample data answers an unknown id with Sara's first job, so
  // only the job asked for counts.
  if (!job || job.id !== jobId) notFound();

  return (
    <Page title={job.title} description={job.company}>
      <Link href="/dashboard" className={backLink}>
        Back to your dashboard
      </Link>
      <Card as="article" aria-labelledby="job-ad-title">
        <h2 id="job-ad-title" className="text-xl">
          Job ad
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          {source === "sample" ? "Sara's sample ad, as she pasted it." : "As you pasted it, word for word."}
        </p>
        {/* The paragraphs and line breaks stay as pasted. */}
        <div className="mt-4 max-w-[65ch] whitespace-pre-wrap break-words">{job.description}</div>
      </Card>
    </Page>
  );
}

export function JobAdFallback() {
  return (
    <Page title="Job ad">
      <Card aria-busy="true" className="h-64" />
    </Page>
  );
}

/** What the page shows for a job that is missing or not the user's own. */
export function JobAdNotFound() {
  return (
    <Page title="We could not find this job ad" description="It may have been deleted, or the link may be wrong.">
      <Link href="/dashboard" className={backLink}>
        Back to your dashboard
      </Link>
    </Page>
  );
}
