import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { askGapQuestions, defaultGapQuestion, skillGaps } from "@/features/tailor/gap-questions";
import { keptGapQuestions } from "@/features/tailor/server/gap-questions-store";
import { modelFailureMessage, tailorModelAccess } from "@/features/tailor/server/model-access";
import { getMyDataSource, getMyJob, getMyMatch, getMyProfile, listMyJobs } from "@/features/tailor/server/my-data";
import { SignInCard } from "@/features/account/sign-in-card";
import { getMySavedChanges } from "@/features/tailor/server/saved-changes";
import type { GapQuestion } from "@/features/tailor/types";
import { getAiMode } from "@/shared/ai";
import type { Job, MatchResult, Profile } from "@/shared/contracts";
import { ButtonLink, Card, Notice, Page, PathSteps, WaitNote, wideFrame } from "@/shared/ui";
import { TailorWorkspace } from "./tailor-workspace";

export const metadata: Metadata = { title: "Tailor your CV" };

/**
 * Shown while the page is built. The first time a job is opened the model writes its gap questions, which a pilot
 * took for a frozen page when all it said was "Loading your CV…" (#332). After that the questions are kept (#318),
 * so the note is only on screen for a moment, and it has to read well for that too.
 */
const tailorLoadingNote =
  "Getting your CV ready for this job. The first time, we also write a few questions about it, which can take up to 30 seconds.";

// /tailor?job=<id>: the user's CV for one job, with a question per gap and every change approved by them.
export default function TailorPage({ searchParams }: PageProps<"/tailor">) {
  return (
    <Suspense
      fallback={
        <Frame>
          <WaitNote>{tailorLoadingNote}</WaitNote>
        </Frame>
      }
    >
      <TailorView searchParams={searchParams} />
    </Suspense>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <Page title="Tailor your CV" description="Answer a few questions about what the job asks for, approve each change, then download and apply.">
      <PathSteps current={3} />
      {children}
    </Page>
  );
}

async function TailorView({ searchParams }: Pick<PageProps<"/tailor">, "searchParams">) {
  const requested = (await searchParams).job;
  const jobId = typeof requested === "string" ? requested : null;

  const profile = await getMyProfile(jobId ? { jobId } : {});
  // Signed out on the live site: there is no profile to tailor, and "Build your profile first" sent a pilot round in
  // a circle (#367). Both links bring them back to this job.
  if (!profile && (await getMyDataSource()) === "none") {
    const here = jobId ? `/tailor?${new URLSearchParams({ job: jobId })}` : "/tailor";
    return (
      <Frame>
        <SignInCard
          title="Sign in to tailor your CV"
          text="Tailoring starts from the profile saved in your account, and every change you approve is kept with it."
          next={here}
        />
      </Frame>
    );
  }
  if (!profile) {
    return (
      <Frame>
        <Notice tone="info" title="Build your profile first">
          Tailoring starts from the profile you approve. Upload your CV or fill in your details yourself.{" "}
          <Link href="/profile" className="text-accent underline">Build your profile</Link>
        </Notice>
      </Frame>
    );
  }

  if (!jobId) {
    return (
      <Frame>
        <JobPicker />
      </Frame>
    );
  }

  const [job, match, source] = await Promise.all([getMyJob(jobId), getMyMatch(jobId), getMyDataSource()]);
  if (!job) {
    return (
      <Frame>
        <Notice tone="error" title="We could not find this job">
          Choose one of your jobs below.
        </Notice>
        <JobPicker />
      </Frame>
    );
  }

  const label = [source === "sample" && "Sample data", getAiMode() === "mock" && "mock mode"].filter(Boolean).join(" · ");
  const header = (
    <p className="text-lg">
      <span className="font-semibold">{job.title}</span> at {job.company}
      {label && <span className="ml-3 rounded-full border border-line px-2 py-0.5 align-middle text-xs text-text-muted">{label}</span>}
    </p>
  );

  if (!match) {
    return (
      <Frame>
        {header}
        <Notice tone="info" title="We have not compared your profile with this job yet">
          Check how your profile matches this job first, then come back to tailor your CV.
        </Notice>
        <div>
          <ButtonLink href="/jobs">Go to your jobs</ButtonLink>
        </div>
      </Frame>
    );
  }

  const [{ questions, notice }, savedChanges] = await Promise.all([questionsFor({ profile, job, match }), getMySavedChanges(job.id)]);
  const prompts = questions.flatMap(({ gapId, question, options }) => {
    const gap = match.gaps.find((item) => item.id === gapId);
    return gap ? [{ gap, question, options }] : [];
  });

  return (
    <main className={`mx-auto flex w-full flex-col gap-6 px-4 py-8 sm:py-12 ${wideFrame}`}>
      <PathSteps current={3} />
      {notice && <Notice tone="info">{notice}</Notice>}
      <TailorWorkspace
        job={job}
        jobUrl={webLink(job.url)}
        label={label}
        profile={profile}
        prompts={prompts}
        savedChanges={savedChanges}
      />
    </main>
  );
}

/**
 * The gap questions, written by the model for a signed-in user once per job and kept (#304). The page always opens: for a visitor in live mode,
 * or when the model fails (the daily limit included), each gap gets its plain default question instead.
 */
async function questionsFor(input: { profile: Profile; job: Job; match: MatchResult }): Promise<{ questions: GapQuestion[]; notice: string | null }> {
  const fallback = skillGaps(input.match.gaps).map(defaultGapQuestion);
  const access = await tailorModelAccess();
  if (!access.allowed) return { questions: fallback, notice: access.message };
  try {
    const { requester } = access;
    // Asked once per job and kept, because the page is rebuilt after many of its actions (#304).
    const questions = await keptGapQuestions({ ...input, userId: requester && "userId" in requester ? requester.userId : undefined }, () => askGapQuestions({ ...input, requester }));
    return { questions, notice: null };
  } catch (error) {
    const message = modelFailureMessage(error, "write the gap questions", "");
    return { questions: fallback, notice: message || null };
  }
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
