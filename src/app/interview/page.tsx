import type { Metadata } from "next";
import { Suspense } from "react";
import type { Job } from "@/shared/contracts";
import { getAiMode } from "@/shared/ai";
import { ButtonLink, Card, Notice, Page } from "@/shared/ui";
import { getCurrentUser } from "@/features/account/current-user";
import { fixtureForJob } from "@/features/interview/fixtures";
import { getMyJob, getMyProfile, listMyJobs } from "@/features/interview/server/my-data";
import { isStoredJobId, loadLatestInterviewSession } from "@/features/interview/server/session-store";
import type { SampleAnswers } from "./_practice/flow";
import { InterviewPractice } from "./practice";

export const metadata: Metadata = { title: "Interview practice" };

// Starts from one of the user's jobs: /interview?job=<id> (the dashboard links here).
export default function InterviewPage({ searchParams }: PageProps<"/interview">) {
  return (
    <Page
      title="Interview practice"
      description="Practise the interview for a job you have been invited to: six questions written for this job and your CV, then feedback on every answer."
    >
      <Suspense fallback={<p className="text-text-muted">Loading your interview…</p>}>
        <InterviewView searchParams={searchParams} />
      </Suspense>
    </Page>
  );
}

async function InterviewView({ searchParams }: Pick<PageProps<"/interview">, "searchParams">) {
  const requested = (await searchParams).job;
  const jobId = typeof requested === "string" ? requested : null;
  const mode = getAiMode();
  const user = await getCurrentUser();
  // First, so a signed-out visitor is asked to sign in rather than told their job cannot be found.
  if (mode === "live" && !user) {
    return (
      <>
        <Notice tone="info" title="Sign in to practise">
          Practice uses AI on your CV and answers, so it needs an account.
        </Notice>
        <ButtonLink href="/sign-in" variant="primary" className="self-start">
          Sign in
        </ButtonLink>
      </>
    );
  }

  const [profile, job] = await Promise.all([getMyProfile(), jobId ? getMyJob(jobId) : null]);

  if (!job) {
    return (
      <>
        {jobId && (
          <Notice tone="warning" title="We could not find this job">
            Choose one of your jobs below.
          </Notice>
        )}
        <JobList jobs={await listMyJobs()} />
      </>
    );
  }

  if (!profile) {
    return (
      <Notice tone="info" title="Add your CV first">
        The questions are written for your CV, so interview practice needs your Profile.{" "}
        <ButtonLink href="/profile" variant="quiet">
          Go to Profile
        </ButtonLink>
      </Notice>
    );
  }

  // Mock mode has ready-made outputs for the interview fixtures only.
  const fixture = fixtureForJob(job.id);
  if (mode === "mock" && !fixture) {
    return (
      <>
        <JobHeading job={job} />
        <Notice tone="info" title="Practice for this job opens when live AI is switched on">
          Until then, you can try it on a sample job.
        </Notice>
        <JobList jobs={(await listMyJobs()).filter((j) => fixtureForJob(j.id))} />
      </>
    );
  }

  const samples: SampleAnswers | undefined =
    mode === "mock" && fixture
      ? Object.fromEntries(Object.entries(fixture.answers).map(([id, answer]) => [id, { main: answer.main, followUp: answer.followUp }]))
      : undefined;
  const saved = user ? await loadLatestInterviewSession(job.id) : null;

  return (
    <>
      <JobHeading job={job} mock={mode === "mock"} />
      <InterviewPractice jobId={job.id} signedIn={Boolean(user)} canSave={isStoredJobId(job.id)} saved={saved} samples={samples} />
    </>
  );
}

function JobHeading({ job, mock = false }: { job: Job; mock?: boolean }) {
  return (
    <p className="text-text-muted">
      <span className="font-semibold text-text">{job.title}</span> at {job.company} · {job.location}
      {mock && <span className="ml-2 inline-block whitespace-nowrap rounded-full border border-line px-2 py-0.5 text-xs">Sample answers · mock mode</span>}
    </p>
  );
}

function JobList({ jobs }: { jobs: Job[] }) {
  if (jobs.length === 0) {
    return (
      <Notice tone="info" title="No jobs yet">
        Paste a job ad on the Jobs page, then come back to practise for it.
      </Notice>
    );
  }
  return (
    <section>
      <h2 className="text-xl">Which interview are you preparing for?</h2>
      <ul className="mt-4 space-y-3">
        {jobs.map((job) => (
          <li key={job.id}>
            <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">{job.title}</p>
                <p className="text-sm text-text-muted">
                  {job.company} · {job.location}
                </p>
              </div>
              <ButtonLink href={`/interview?job=${encodeURIComponent(job.id)}`} className="self-start sm:self-auto">
                Practise for this job
              </ButtonLink>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
