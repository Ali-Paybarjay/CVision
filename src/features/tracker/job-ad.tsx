import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/features/account/current-user";
import { withNext } from "@/features/account/safe-redirect";
import { getMyJob } from "@/features/profile/my-data";
import type { Job } from "@/shared/contracts";
import { personas } from "@/shared/sample-data";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { ButtonLink, Card, Page } from "@/shared/ui";
import { jobAdPath } from "./model";

const backLink = "inline-flex min-h-11 items-center self-start text-sm font-semibold text-accent underline underline-offset-4";

/**
 * One job's full ad, as the user pasted it, opened from its row on the dashboard (#208). Only the user's own job:
 * any other id is not found. Reads the session, so render it inside <Suspense>.
 */
export async function JobAd({ jobId }: { jobId: string }) {
  // The same three cases as loadTracker, so the page opens only what the dashboard links to.
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    // Sara's two jobs, the only sample rows with a "Job ad" link.
    const sample = personas.sara.jobs.find((job) => job.id === jobId);
    if (!sample) notFound();
    return <JobAdView job={sample} note="Sara's sample ad, as she pasted it." />;
  }

  // First, so a visitor whose session has expired is asked to sign in, not told the ad may have been deleted.
  if (!(await getCurrentUser())) return <JobAdSignedOut jobId={jobId} />;

  // Row-level security keeps other users' jobs out.
  const job = await getMyJob(jobId);
  if (!job || job.id !== jobId) notFound();
  return <JobAdView job={job} note="As you pasted it, word for word." />;
}

function JobAdView({ job, note }: { job: Job; note: string }) {
  return (
    <Page title={job.title} description={job.company}>
      <Link href="/dashboard" className={backLink}>
        Back to your dashboard
      </Link>
      <Card as="article" aria-labelledby="job-ad-title">
        <h2 id="job-ad-title" className="text-xl">
          Job ad
        </h2>
        <p className="mt-1 text-sm text-text-muted">{note}</p>
        {/* The paragraphs and line breaks stay as pasted. */}
        <div className="mt-4 max-w-[65ch] whitespace-pre-wrap break-words">{job.description}</div>
      </Card>
    </Page>
  );
}

function JobAdSignedOut({ jobId }: { jobId: string }) {
  return (
    <Page title="Sign in to see this job ad" description="Your job ads are kept in your account.">
      {/* Brings them back to this ad once they have signed in. */}
      <ButtonLink href={withNext("/sign-in", jobAdPath(jobId))} variant="primary" className="self-start">
        Sign in
      </ButtonLink>
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
