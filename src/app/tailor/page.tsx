import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { askGapQuestions } from "@/features/tailor/gap-questions";
import { sampleForGap } from "@/features/tailor/samples";
import { getMyJob, getMyMatch, getMyProfile, listMyJobs } from "@/features/tailor/server/my-data";
import { getAiMode } from "@/shared/ai";
import { ButtonLink, Card, Notice, Page } from "@/shared/ui";
import { TailorWorkspace } from "./tailor-workspace";

export const metadata: Metadata = { title: "Tailor your CV" };

// /tailor?job=<id>: the user's CV for one job, with a question per gap and every change approved by them.
export default function TailorPage({ searchParams }: PageProps<"/tailor">) {
  return (
    <Page width="wide" title="Tailor your CV" description="Answer a few questions, then approve each change before it goes into your CV.">
      <Suspense fallback={<p className="text-text-muted">Loading your CV…</p>}>
        <TailorView searchParams={searchParams} />
      </Suspense>
    </Page>
  );
}

async function TailorView({ searchParams }: Pick<PageProps<"/tailor">, "searchParams">) {
  const requested = (await searchParams).job;
  const jobId = typeof requested === "string" ? requested : null;

  const profile = await getMyProfile();
  if (!profile) {
    return (
      <Notice tone="info" title="Upload your CV first">
        Tailoring starts from your CV. <Link href="/profile" className="text-accent underline">Upload your CV</Link>
      </Notice>
    );
  }

  if (!jobId) return <JobPicker />;

  const [job, match] = await Promise.all([getMyJob(jobId), getMyMatch(jobId)]);
  if (!job) {
    return (
      <Notice tone="error" title="We could not find this job">
        Choose one of your jobs below.
      </Notice>
    );
  }

  const header = (
    <p className="text-lg">
      <span className="font-semibold">{job.title}</span> at {job.company}
      {getAiMode() === "mock" && (
        <span className="ml-3 rounded-full border border-line px-2 py-0.5 align-middle text-xs text-text-muted">Sample data · mock mode</span>
      )}
    </p>
  );

  if (!match) {
    return (
      <>
        {header}
        <Notice tone="info" title="We have not compared your CV with this job yet">
          Check how your CV matches this job first, then come back to tailor it.
        </Notice>
        <div>
          <ButtonLink href="/jobs">Go to your jobs</ButtonLink>
        </div>
      </>
    );
  }

  const questions = await askGapQuestions({ profile, job, match });
  const showSamples = getAiMode() === "mock";
  const prompts = questions.flatMap(({ gapId, question }) => {
    const gap = match.gaps.find((item) => item.id === gapId);
    if (!gap) return [];
    const sampleAnswer = showSamples ? (sampleForGap(job.id, gap.id).answer?.answer ?? null) : null;
    return [{ gap, question, sampleAnswer }];
  });

  return (
    <>
      {header}
      <TailorWorkspace jobId={job.id} jobUrl={webLink(job.url)} company={job.company} profile={profile} prompts={prompts} />
    </>
  );
}

/** Only an http(s) link may open from the Apply button; anything else in a pasted ad counts as no link. */
function webLink(url: string | null): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null;
}

async function JobPicker() {
  const jobs = await listMyJobs();
  if (jobs.length === 0) {
    return (
      <Notice tone="info" title="Add a job first">
        Paste a job ad to tailor your CV for it. <Link href="/jobs" className="text-accent underline">Add a job</Link>
      </Notice>
    );
  }
  return (
    <Card>
      <h2 className="text-xl">Which job is this CV for?</h2>
      <ul className="mt-4 flex flex-col gap-3">
        {jobs.map((job) => (
          <li key={job.id}>
            <Link href={`/tailor?job=${encodeURIComponent(job.id)}`} className="text-accent underline underline-offset-4">
              {job.title} at {job.company}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
