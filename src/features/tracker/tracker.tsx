import { io } from "next/cache";
import { brand } from "@/shared/brand";
import { ButtonLink, Card, Notice } from "@/shared/ui";
import { ApplicationList } from "./application-list";
import { loadTracker } from "./applications";
import { londonToday } from "./model";

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
      const count = tracker.items.length;
      if (count === 0) return <EmptyTracker />;
      return (
        <TrackerSection
          title="Your applications"
          intro={`${count} ${count === 1 ? "application" : "applications"}. Keep each status up to date and note what you will do next.`}
        >
          <ApplicationList items={tracker.items} today={today} />
        </TrackerSection>
      );
    }
  }
}

function TrackerSection({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby="tracker-title" className="flex flex-col gap-4">
      <div>
        <h2 id="tracker-title" className="text-xl">
          {title}
        </h2>
        <p className="mt-1 max-w-[65ch] text-text-muted">{intro}</p>
      </div>
      {children}
    </section>
  );
}

/** No applications yet: the three steps that lead to the first one. */
function EmptyTracker() {
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
            <h3 className="mt-2 text-base">{step.title}</h3>
            <p className="mt-1 max-w-[40ch] text-sm text-text-muted">{step.detail}</p>
          </li>
        ))}
      </ol>
      <ButtonLink href="/profile" variant="primary" className="mt-6">
        Upload your CV
      </ButtonLink>
    </Card>
  );
}

export function TrackerFallback() {
  return <Card aria-busy="true" className="h-64" />;
}
