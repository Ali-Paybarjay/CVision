import type { Metadata } from "next";
import { Suspense } from "react";
import { JobAd, JobAdFallback } from "@/features/tracker/job-ad";

export const metadata: Metadata = { title: "Job ad" };

// /dashboard/jobs/<id>: the full ad of one of the user's jobs, opened from its row on the dashboard (#208).
export default function JobAdPage({ params }: PageProps<"/dashboard/jobs/[jobId]">) {
  return (
    <Suspense fallback={<JobAdFallback />}>
      <JobAdSection params={params} />
    </Suspense>
  );
}

async function JobAdSection({ params }: Pick<PageProps<"/dashboard/jobs/[jobId]">, "params">) {
  const { jobId } = await params;
  return <JobAd jobId={jobId} />;
}
