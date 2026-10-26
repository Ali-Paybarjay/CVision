import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser } from "@/features/account/current-user";
import { nothingToWrite } from "@/features/profile/linkedin";
import { getMyDataSource, getMyJob, getMyProfile, listMyJobs } from "@/features/profile/my-data";
import { BackLink } from "@/features/profile/ui/back-link";
import { LinkedInSuggester } from "@/features/profile/ui/linkedin-suggester";
import { SignInNotice } from "@/features/profile/ui/upload-step";
import { getAiMode } from "@/shared/ai";
import type { Job } from "@/shared/contracts";
import { Card, Notice, Page } from "@/shared/ui";

export const metadata: Metadata = { title: "Your LinkedIn Experience" };

/** One model request per click, which may be asked twice. */
export const maxDuration = 60;

// /jobs/linkedin?job=<id>: what to write under each role of the user's LinkedIn profile for one of their jobs.
export default function LinkedInPage({ searchParams }: PageProps<"/jobs/linkedin">) {
  return (
    <Page
      title="Your LinkedIn Experience"
      description="What to add under each role in the Experience section of your LinkedIn profile, for one job. Every line comes from your CV or your own answers, and you copy what you want."
    >
      <Suspense
        fallback={
          <div className="flex flex-col gap-6">
            <BackLink href="/jobs" />
            <Card aria-busy="true">
              <p className="text-text-muted">Loading your profile…</p>
            </Card>
          </div>
        }
      >
        <LinkedInView searchParams={searchParams} />
      </Suspense>
    </Page>
  );
}

async function LinkedInView({ searchParams }: Pick<PageProps<"/jobs/linkedin">, "searchParams">) {
  const requested = (await searchParams).job;
  const jobId = typeof requested === "string" ? requested : null;
  const mode = getAiMode();
  const here = jobId ? `/jobs/linkedin?${new URLSearchParams({ job: jobId })}` : "/jobs/linkedin";

  // First, so a signed-out visitor is asked to sign in rather than shown the sample data.
  if (mode === "live" && !(await getCurrentUser())) {
    return (
      <WithBack>
        <SignInNotice title="Sign in to get LinkedIn lines" next={here} />
      </WithBack>
    );
  }

  const profile = await getMyProfile(jobId ? { jobId } : {});
  if (!profile) {
    return (
      <WithBack>
        <Notice tone="info" title="Upload your CV first">
          Your LinkedIn lines come from your CV.{" "}
          <Link href="/profile" className="font-semibold text-accent hover:underline">
            Upload your CV
          </Link>
        </Notice>
      </WithBack>
    );
  }

  const nothing = nothingToWrite(profile);
  if (nothing) {
    return (
      <WithBack>
        <Notice tone="info" title={nothing === "no-roles" ? "Add your work experience first" : "Add what you did in each role first"}>
          {nothing === "no-roles"
            ? "LinkedIn lines are written for the roles on your CV, and your profile has none yet."
            : "LinkedIn lines are taken from the duties and results under each role, and your profile has none yet."}{" "}
          <Link href="/profile" className="font-semibold text-accent hover:underline">
            Go to my profile
          </Link>
        </Notice>
      </WithBack>
    );
  }

  if (!jobId) {
    return (
      <WithBack>
        <JobPicker jobs={await listMyJobs()} />
      </WithBack>
    );
  }

  const [job, source] = await Promise.all([getMyJob(jobId), getMyDataSource()]);
  // The sample data answers any unknown id with Sara's first job, so check it is the job asked for.
  if (!job || job.id !== jobId) {
    return (
      <WithBack>
        <Notice tone="error" title="We couldn’t find this job">
          Choose one of your jobs below.
        </Notice>
        <JobPicker jobs={await listMyJobs()} />
      </WithBack>
    );
  }

  const label = [source === "sample" && "Sample data", mode === "mock" && "mock mode"].filter(Boolean).join(" · ");
  return (
    <WithBack>
      <p className="text-lg">
        <span className="font-semibold">{job.title}</span> at {job.company}
        {label && (
          <span className="ml-3 rounded-full border border-line px-2 py-0.5 align-middle text-xs whitespace-nowrap text-text-muted">
            {label}
          </span>
        )}
      </p>
      <LinkedInSuggester
        key={job.id}
        jobId={job.id}
        here={here}
        demoMode={mode === "mock"}
        sampleName={source === "sample" ? profile.fullName : null}
      />
    </WithBack>
  );
}

/** Back first, then the page's content. */
function WithBack({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/jobs" />
      {children}
    </div>
  );
}

function JobPicker({ jobs }: { jobs: Job[] }) {
  if (jobs.length === 0) {
    return (
      <Notice tone="info" title="Check a job ad first">
        LinkedIn lines are written for one job.{" "}
        <Link href="/jobs" className="font-semibold text-accent hover:underline">
          Check a job ad
        </Link>
      </Notice>
    );
  }
  return (
    <Card>
      <h2 className="text-xl">Which job are you applying for?</h2>
      <ul className="mt-4 flex flex-col gap-3">
        {jobs.map((job) => (
          <li key={job.id}>
            <Link
              href={`/jobs/linkedin?job=${encodeURIComponent(job.id)}`}
              className="text-accent underline underline-offset-4"
            >
              {job.title} at {job.company}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
