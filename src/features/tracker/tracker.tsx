import { io } from "next/cache";
import Link from "next/link";
import { brand } from "@/shared/brand";
import { ButtonLink, Card, CheckIcon, Notice } from "@/shared/ui";
import { ApplicationList } from "./application-list";
import { loadTracker } from "./applications";
import { londonToday, savedCvPath, tailorPath, type JobInProgress } from "./model";

/** The dashboard's application tracker. Reads the session, so render it inside <Suspense>. */
export async function Tracker() {
  // Days without news and to the closing date count from today, so the tracker is never part of the static
  // shell, in sample mode too. One date for the whole render, so the browser shows the same numbers.
  await io();
  const today = londonToday();
  const tracker = await loadTracker(today);

  switch (tracker.kind) {
    // The account panel below asks them to sign in.
    case "signed-out":
      return null;
    case "error":
      return (
        <Notice tone="error" title="We could not load your applications">
          Refresh the page to try again.
        </Notice>
      );
    case "sample":
      return (
        <TrackerSection
          title="Sara's sample applications"
          intro="Sara is a fictional example. Try changing a status: nothing is saved until accounts are switched on."
        >
          <ApplicationList items={tracker.items} today={today} sample />
        </TrackerSection>
      );
    case "account": {
      const { items, hasProfile, inProgress } = tracker;
      const count = items.length;
      // With a profile and no application yet, carrying on with the newest job is the next step, so its link is the
      // page's one Coral button.
      const jobs = <JobsInProgress jobs={inProgress} primary={hasProfile && count === 0} />;
      if (count === 0) {
        return (
          <>
            <EmptyTracker hasProfile={hasProfile} inProgress={inProgress} />
            {jobs}
          </>
        );
      }
      return (
        <>
          <TrackerSection
            title="Your applications"
            intro={`${count} ${count === 1 ? "application" : "applications"}. Keep each status up to date and note what you will do next.`}
          >
            <ApplicationList items={items} today={today} />
          </TrackerSection>
          {jobs}
        </>
      );
    }
  }
}

type TrackerSectionProps = { titleId?: string; title: string; intro: string; children: React.ReactNode };

function TrackerSection({ titleId = "tracker-title", title, intro, children }: TrackerSectionProps) {
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4">
      <div>
        <h2 id={titleId} className="text-xl">
          {title}
        </h2>
        <p className="mt-1 max-w-[65ch] text-text-muted">{intro}</p>
      </div>
      {children}
    </section>
  );
}

/**
 * No applications yet: the three steps that lead to the first one, with the steps done marked, and a button for the
 * next one (#506). With a profile and a job, the button is on the newest job instead, under Jobs in progress.
 */
function EmptyTracker({ hasProfile, inProgress }: { hasProfile: boolean; inProgress: JobInProgress[] }) {
  const hasJob = inProgress.length > 0;
  // The brand steps in order: a profile, a job ad checked, a CV saved for a job.
  const done = [hasProfile, hasJob, inProgress.some((job) => job.hasCv)];
  return (
    <Card aria-labelledby="tracker-title">
      <h2 id="tracker-title" className="text-xl">
        No applications yet
      </h2>
      <p className="mt-1 max-w-[65ch] text-text-muted">
        When you press Apply on a tailored job, it appears here with its status and your next step.
      </p>
      <ol className="mt-6 grid gap-6 md:grid-cols-3">
        {brand.steps.map((step, index) => (
          <li key={step.title} className="border-t-2 border-line pt-4">
            <p aria-hidden="true" className="text-2xl font-bold text-accent">
              {index + 1}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <h3 className="text-base">{step.title}</h3>
              {done[index] && (
                // An icon and a word, never colour alone.
                <p className="flex items-center gap-1.5 text-sm font-semibold text-accent">
                  <CheckIcon className="size-4 shrink-0" />
                  Done
                </p>
              )}
            </div>
            <p className="mt-1 max-w-[40ch] text-sm text-text-muted">{step.detail}</p>
          </li>
        ))}
      </ol>
      {!hasProfile && (
        <ButtonLink href="/profile" variant="primary" className="mt-6">
          Build your profile
        </ButtonLink>
      )}
      {hasProfile && !hasJob && (
        // Named as the page it opens.
        <ButtonLink href="/jobs" variant="primary" className="mt-6">
          Check a job ad
        </ButtonLink>
      )}
    </Card>
  );
}

// The small links under a job's title, as on an application's row. 44px tall, so a thumb can tap them.
const rowLinkClass = "inline-flex min-h-11 items-center self-start text-sm font-semibold text-accent underline underline-offset-4";

/**
 * The jobs the user has checked but not added to their applications yet, newest first, each with a link back to
 * Tailor (#506). `primary`: the first job's link is the page's one Coral button.
 */
function JobsInProgress({ jobs, primary }: { jobs: JobInProgress[]; primary: boolean }) {
  if (jobs.length === 0) return null;
  return (
    <TrackerSection titleId="in-progress-title" title="Jobs in progress" intro="Jobs you have checked but not added to your applications yet.">
      <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
        {jobs.map((job, index) => (
          <li key={job.id} className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 p-5 sm:p-6">
            <div className="flex flex-col gap-1">
              <h3 className="text-lg leading-snug">{job.title}</h3>
              <p className="text-text-muted">{job.company}</p>
              {job.hasCv && (
                <Link href={savedCvPath(job.id)} className={rowLinkClass}>
                  CV and cover letter<span className="sr-only">{` you saved for ${job.title} at ${job.company}`}</span>
                </Link>
              )}
            </div>
            <ButtonLink href={tailorPath(job.id)} variant={primary && index === 0 ? "primary" : "secondary"}>
              Carry on tailoring<span className="sr-only">{` your CV for ${job.title} at ${job.company}`}</span>
            </ButtonLink>
          </li>
        ))}
      </ul>
      <Link href="/tailor" className={rowLinkClass}>
        See all your jobs
      </Link>
    </TrackerSection>
  );
}

export function TrackerFallback() {
  return <Card aria-busy="true" className="h-64" />;
}
