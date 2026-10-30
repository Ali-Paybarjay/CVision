import type { Metadata } from "next";
import { Suspense } from "react";
import type { Job } from "@/shared/contracts";
import { getAiMode } from "@/shared/ai";
import { ButtonLink, Card, Notice, Page } from "@/shared/ui";
import { getCurrentUser } from "@/features/account/current-user";
import { withNext } from "@/features/account/safe-redirect";
import { fixtureForJob } from "@/features/interview/fixtures";
import { getMyJob, getMyProfile, listMyJobs } from "@/features/interview/server/my-data";
import {
  isStoredJobId,
  listPracticeResults,
  loadLatestInterviewSession,
  loadLatestReport,
  type PracticeResult,
} from "@/features/interview/server/session-store";
import type { SampleAnswers } from "./_practice/flow";
import { practisedOn } from "./_practice/ui";
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
    // Brings them back to this job once they have signed in.
    const here = jobId ? `/interview?${new URLSearchParams({ job: jobId })}` : "/interview";
    return (
      <>
        <Notice tone="info" title="Sign in to practise">
          Practice uses AI on your CV and answers, so it needs an account.
        </Notice>
        <ButtonLink href={withNext("/sign-in", here)} variant="primary" className="self-start">
          Sign in
        </ButtonLink>
      </>
    );
  }

  const [profile, job] = await Promise.all([getMyProfile({ jobId: jobId ?? undefined }), jobId ? getMyJob(jobId) : null]);

  if (!job) {
    return (
      <>
        {jobId && (
          <Notice tone="warning" title="We could not find this job">
            Choose one of your jobs below.
          </Notice>
        )}
        <JobList jobs={await listMyJobs()} practised={await listPracticeResults()} />
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
        <JobList jobs={(await listMyJobs()).filter((j) => fixtureForJob(j.id))} practised={[]} />
      </>
    );
  }

  const samples: SampleAnswers | undefined =
    mode === "mock" && fixture
      ? Object.fromEntries(Object.entries(fixture.answers).map(([id, answer]) => [id, { main: answer.main, followUp: answer.followUp }]))
      : undefined;
  const [saved, lastReport] = user ? await Promise.all([loadLatestInterviewSession(job.id), loadLatestReport(job.id)]) : [null, null];

  return (
    <>
      <JobHeading job={job} mock={mode === "mock"} />
      <InterviewPractice
        jobId={job.id}
        signedIn={Boolean(user)}
        canSave={isStoredJobId(job.id)}
        saved={saved}
        lastReport={lastReport}
        samples={samples}
      />
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

function JobList({ jobs, practised }: { jobs: Job[]; practised: PracticeResult[] }) {
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
        {jobs.map((job) => {
          const last = practised.find((p) => p.jobId === job.id);
          return (
            <li key={job.id}>
              <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">{job.title}</p>
                  <p className="text-sm text-text-muted">
                    {job.company} · {job.location}
                  </p>
                  {last && (
                    <p className="mt-1 text-sm">
                      Practised <time dateTime={last.practisedAt}>{practisedOn(last.practisedAt)}</time> ·{" "}
                      {last.overall === null ? "Suggested answers from your CV" : `${last.overall.toFixed(1)} / 5`}
                    </p>
                  )}
                </div>
                <ButtonLink href={`/interview?job=${encodeURIComponent(job.id)}`} className="self-start sm:self-auto">
                  {last ? "See your report" : "Practise for this job"}
                </ButtonLink>
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
