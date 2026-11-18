"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode, type RefCallback, type RefObject } from "react";
import { Card } from "@/shared/ui";
import { JobListItem } from "./job-list-item";

/** A job as the list shows it. */
export type JobListJob = {
  id: string;
  /** "<title> at <company>". */
  name: string;
  href: string;
  /** The user applied for it, so it stays on their dashboard and can't be deleted here (#462). */
  onDashboard: boolean;
};

/** The last thing said to a screen reader, counted so that deleting a second job of the same name is said again. */
export type JobListSaid = { text: string; count: number };

type JobListProps = {
  title: string;
  jobs: JobListJob[];
  /** What the page shows when the user has no jobs: shown in the card's place once the last one is deleted. */
  empty: ReactNode;
};

/**
 * The user's jobs in a card, such as Tailor's "Which job is this CV for?", each with Delete (#462). A deleted job
 * leaves the list at once, with nothing in its place, so the list looks as it will after a reload (#519). Focus moves
 * to the next job's link (the one before it when the last row goes, or into `empty` when none is left), and a screen
 * reader hears which job was deleted. The jobs still in progress come first, as the list is for picking the one the
 * user is working on, and the jobs on their dashboard follow, together at the bottom (Marzieh, #519).
 */
export function JobList({ title, jobs, empty }: JobListProps) {
  const ordered = inProgressFirst(jobs);
  const router = useRouter();
  const [deleted, setDeleted] = useState<string[]>([]);
  const [said, setSaid] = useState<JobListSaid | null>(null);
  const links = useRef(new Map<string, HTMLAnchorElement>());
  const emptyBox = useRef<HTMLDivElement>(null);
  // The job that just left the list, and the list's order then, so focus can move on from where it was.
  const justDeleted = useRef<{ id: string; order: string[] } | null>(null);

  useEffect(() => {
    const gone = justDeleted.current;
    if (!gone) return;
    justDeleted.current = null;
    const next = jobAfter(gone.order, gone.id, deleted);
    if (next) links.current.get(next)?.focus();
    else emptyBox.current?.querySelector<HTMLElement>("a[href], button")?.focus();
  }, [deleted]);

  const onDeleted = (job: JobListJob) => {
    justDeleted.current = { id: job.id, order: ordered.map(({ id }) => id) };
    setDeleted((ids) => [...ids, job.id]);
    setSaid((last) => ({ text: `Deleted: ${job.name}`, count: (last?.count ?? 0) + 1 }));
    // The browser's Back button shows the copy of this page Next kept, which still had the job: refreshing replaces it.
    router.refresh();
  };

  const link =
    (id: string): RefCallback<HTMLAnchorElement> =>
    (element) => {
      if (!element) return;
      links.current.set(id, element);
      return () => {
        links.current.delete(id);
      };
    };

  return (
    <JobListView
      title={title}
      jobs={ordered.filter((job) => !deleted.includes(job.id))}
      empty={empty}
      said={said}
      onDeleted={onDeleted}
      refs={{ link, emptyBox }}
    />
  );
}

/** The list as it looks with these jobs left, kept apart from the state so it can be checked on its own. */
export function JobListView({
  title,
  jobs,
  empty,
  said,
  onDeleted,
  refs,
}: JobListProps & {
  said: JobListSaid | null;
  onDeleted: (job: JobListJob) => void;
  refs?: { link: (id: string) => RefCallback<HTMLAnchorElement>; emptyBox: RefObject<HTMLDivElement | null> };
}) {
  return (
    <>
      {jobs.length === 0 ? (
        <div ref={refs?.emptyBox}>{empty}</div>
      ) : (
        <Card>
          <h2 className="text-xl">{title}</h2>
          <ul className="mt-4 flex flex-col gap-3">
            {jobs.map((job) => (
              <JobListItem
                key={job.id}
                jobId={job.id}
                name={job.name}
                href={job.href}
                onDashboard={job.onDashboard}
                onDeleted={() => onDeleted(job)}
                linkRef={refs?.link(job.id)}
              />
            ))}
          </ul>
        </Card>
      )}
      {/* On the page from the start, so a screen reader is listening before anything is said; each message is a new node. */}
      <p role="status" className="sr-only">
        {said && <span key={said.count}>{said.text}</span>}
      </p>
    </>
  );
}

/** The jobs still in progress first, then the ones on the user's dashboard, each group in the order given. */
export function inProgressFirst(jobs: JobListJob[]): JobListJob[] {
  return [...jobs.filter((job) => !job.onDashboard), ...jobs.filter((job) => job.onDashboard)];
}

/** The job to move focus to once `gone` leaves the list: the next one still shown, else the one before it, else none. */
export function jobAfter(ids: string[], gone: string, deleted: string[]): string | null {
  const at = ids.indexOf(gone);
  const shown = (id: string) => !deleted.includes(id);
  return ids.slice(at + 1).find(shown) ?? ids.slice(0, at).findLast(shown) ?? null;
}
