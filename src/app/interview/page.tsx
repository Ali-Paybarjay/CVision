import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import type { Job } from "@/shared/contracts";
import { getAiMode } from "@/shared/ai";
import { ButtonLink, Card, cn, Notice, wideFrame } from "@/shared/ui";
import { getCurrentUser } from "@/features/account/current-user";
import { defaultComposition } from "@/features/interview/config";
import { withNext } from "@/features/account/safe-redirect";
import { isCvTooThin, profileToCvText } from "@/features/interview/engine/text";
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
import { BackLink } from "@/features/profile/ui/back-link";
import { InterviewPractice } from "./practice";

export const metadata: Metadata = { title: "Interview practice" };

const questionCount = defaultComposition.technical + defaultComposition.behavioural;

// Starts from one of the user's jobs: /interview?job=<id> (the dashboard links here).
export default function InterviewPage({ searchParams }: PageProps<"/interview">) {
  // Wide, for design A's question page (docs/design/paper-desk); every other view keeps a readable measure inside it.
  return (
    <main className={`mx-auto w-full px-4 py-8 sm:py-12 ${wideFrame}`}>
      <Suspense
        fallback={
          <Frame>
            <p className="text-text-muted">Loading your interview…</p>
          </Frame>
        }
      >
        <InterviewView searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

/**
 * The page's top: for a job, the way back to Jobs, "Interview practice: <job>" and what the practice is; otherwise
 * the plain title. `wide` lets the practice use the page's full width, for the question sheet and its side column.
 */
function Frame({ job, mock = false, wide = false, children }: { job?: Job; mock?: boolean; wide?: boolean; children: ReactNode }) {
  return (
    <>
      {/* Back to wherever the user came from (Tailor, the dashboard, Jobs), as on Profile and Jobs (#297). */}
      <BackLink href="/dashboard" />
      {job && (
        <nav aria-label="Breadcrumb" className="text-sm text-text-muted">
          <ol className="flex flex-wrap items-center gap-x-2">
            <li>
              <Link href="/jobs" className="text-accent underline underline-offset-2 hover:text-text">
                Jobs
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li className="[overflow-wrap:anywhere]">{job.title}</li>
            <li aria-hidden="true">/</li>
            <li aria-current="page">Interview practice</li>
          </ol>
        </nav>
      )}
      <h1 className={cn("text-3xl leading-tight tracking-tight [overflow-wrap:anywhere] sm:text-4xl", job && "mt-3")}>
        {job ? `Interview practice: ${job.title}` : "Interview practice"}
      </h1>
      {job ? (
        <div className="mt-3 max-w-[70ch] space-y-1 text-text-muted">
          <p>
            <span className="font-semibold text-text">{job.company}</span> · {job.location}
            {mock && <span className="ml-2 inline-block whitespace-nowrap rounded-full border border-line px-2 py-0.5 text-xs">Sample answers · mock mode</span>}
          </p>
          <p>
            {questionCount} questions written from this job ad and your profile. Answer as you would out loud. Each answer is scored when you finish it,
            and you get one report at the end.
          </p>
        </div>
      ) : (
        <p className="mt-3 max-w-[65ch] text-lg text-text-muted">
          Get ready for a job interview, even before you are invited: six questions written for the job and your profile, then feedback on every answer.
        </p>
      )}
      <div className={cn("mt-8 flex flex-col gap-6", !wide && "max-w-3xl")}>{children}</div>
    </>
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
      <Frame>
        <Notice tone="info" title="Sign in for interview practice">
          Practice uses AI on your profile and answers, so it needs an account.
        </Notice>
        <ButtonLink href={withNext("/sign-in", here)} variant="primary" className="self-start">
          Sign in
        </ButtonLink>
      </Frame>
    );
  }

  const [profile, job] = await Promise.all([getMyProfile({ jobId: jobId ?? undefined }), jobId ? getMyJob(jobId) : null]);

  if (!job) {
    return (
      <Frame>
        {jobId && (
          <Notice tone="warning" title="We could not find this job">
            Choose one of your jobs below.
          </Notice>
        )}
        <JobList jobs={await listMyJobs()} practised={await listPracticeResults()} />
      </Frame>
    );
  }

  if (!profile) {
    return (
      <Frame job={job}>
        <Notice tone="info" title="Build your profile first">
          The questions are written for your profile, so upload your CV or fill in your details first.{" "}
          <ButtonLink href="/profile" variant="quiet">
            Go to Profile
          </ButtonLink>
        </Notice>
      </Frame>
    );
  }

  // The same CV text the questions are written from.
  const cv = profileToCvText(profile);
  // A profile typed in by hand can hold little more than a name; the API refuses it too, before any AI request (#179).
  if (isCvTooThin(cv)) {
    return (
      <Frame job={job}>
        <Notice tone="info" title="Add more to your profile first">
          The questions are written from your profile, and there isn&apos;t enough in it yet. Add your experience, education or
          skills, then come back.{" "}
          <ButtonLink href="/profile" variant="quiet">
            Go to Profile
          </ButtonLink>
        </Notice>
      </Frame>
    );
  }

  // Mock mode has ready-made outputs for the interview fixtures only.
  const fixture = fixtureForJob(job.id);
  if (mode === "mock" && !fixture) {
    return (
      <Frame job={job}>
        <Notice tone="info" title="Practice for this job opens when live AI is switched on">
          Until then, you can try it on a sample job.
        </Notice>
        <JobList jobs={(await listMyJobs()).filter((j) => fixtureForJob(j.id))} practised={[]} />
      </Frame>
    );
  }

  const samples: SampleAnswers | undefined =
    mode === "mock" && fixture
      ? Object.fromEntries(Object.entries(fixture.answers).map(([id, answer]) => [id, { main: answer.main, followUp: answer.followUp }]))
      : undefined;
  const [saved, lastReport] = user ? await Promise.all([loadLatestInterviewSession(job.id), loadLatestReport(job.id)]) : [null, null];

  return (
    <Frame job={job} mock={mode === "mock"} wide>
      <InterviewPractice
        jobId={job.id}
        signedIn={Boolean(user)}
        canSave={isStoredJobId(job.id)}
        saved={saved}
        lastReport={lastReport}
        cv={cv}
        samples={samples}
      />
    </Frame>
  );
}

function JobList({ jobs, practised }: { jobs: Job[]; practised: PracticeResult[] }) {
  if (jobs.length === 0) {
    return (
      <Notice tone="info" title="No jobs yet">
        Paste a job ad on the Jobs page, then come back here for interview practice.
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
                      Last practice <time dateTime={last.practisedAt}>{practisedOn(last.practisedAt)}</time> ·{" "}
                      {last.overall === null ? "Suggested answers from your profile" : `${last.overall.toFixed(1)} / 5`}
                    </p>
                  )}
                </div>
                <ButtonLink href={`/interview?job=${encodeURIComponent(job.id)}`} className="self-start sm:self-auto">
                  {last ? "See your report" : "Start practice"}
                </ButtonLink>
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
