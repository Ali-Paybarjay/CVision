"use client";

import { startTransition, useActionState, useState } from "react";
import { ApplicationStatusSchema, type Application } from "@/shared/contracts";
import { Button, ButtonLink, CheckIcon, ErrorIcon, Field, InfoIcon, Input, Select, WarningIcon } from "@/shared/ui";
import { closeWithoutNews, updateApplication } from "./actions";
import {
  ApplicationChangeSchema,
  applyChange,
  canCloseWithoutNews,
  closedLast,
  closingDate,
  dayCount,
  daysWithoutNews,
  formatDate,
  markNoResponse,
  nextStepMaxLength,
  noNewsDays,
  statusDateLabels,
  statusLabels,
  suggestClosing,
  type ClosingDate,
  type CloseWithoutNewsResult,
  type TrackedApplication,
  type UpdateApplicationResult,
} from "./model";

type ApplicationListProps = {
  items: TrackedApplication[];
  /** Today in London, worked out once on the server, so every row and the browser count from the same day. */
  today: string;
  /** Sample rows change on this page only: nothing is sent to the server. */
  sample?: boolean;
};

/**
 * The user's applications, one row each, with the status and next step they can change, and closed ones at the
 * bottom. Above them, applied and interview rows with no news for 60 days or more are suggested for closing.
 */
export function ApplicationList({ items, today, sample = false }: ApplicationListProps) {
  // What this page has saved since it loaded, by id. Every row reads from it, so a row closed here moves to the
  // bottom at once, in sample mode too, and the suggestion and the rows always agree.
  const [changed, setChanged] = useState<Record<string, Application>>({});
  const current = items.map((item) => ({ ...item, application: changed[item.application.id] ?? item.application }));
  const keep = (applications: Application[]) =>
    setChanged((previous) => ({ ...previous, ...Object.fromEntries(applications.map((application) => [application.id, application])) }));

  return (
    <>
      <CloseWithoutNews items={suggestClosing(current, today)} today={today} sample={sample} onClosed={keep} />
      <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
        {closedLast(current).map((item) => (
          <ApplicationRow
            key={item.application.id}
            item={item}
            today={today}
            sample={sample}
            onSaved={(application) => keep([application])}
          />
        ))}
      </ul>
    </>
  );
}

type ApplicationRowProps = {
  item: TrackedApplication;
  today: string;
  sample: boolean;
  onSaved: (application: Application) => void;
};

function ApplicationRow({ item, today, sample, onSaved }: ApplicationRowProps) {
  const { application: saved, job } = item;
  const [status, setStatus] = useState(saved.status);
  const [nextStep, setNextStep] = useState(saved.nextStep ?? "");
  // When the saved application changes outside this form (closed from the suggestion above), the form follows it.
  const [formFor, setFormFor] = useState(saved);
  if (formFor.status !== saved.status || formFor.nextStep !== saved.nextStep) {
    setFormFor(saved);
    setStatus(saved.status);
    setNextStep(saved.nextStep ?? "");
  }
  const [result, save, pending] = useActionState<UpdateApplicationResult | null, { status: string; nextStep: string }>(async (_previous, change) => {
    const outcome = sample ? changeSample(saved, change, today) : await updateApplication(saved.id, change);
    if (outcome.ok) onSaved(outcome.application);
    return outcome;
  }, null);

  const unsaved = status !== saved.status || nextStep.trim() !== (saved.nextStep ?? "");
  // Both worked out on each render from today's date, never saved.
  const days = daysWithoutNews(saved, today);
  const closing = closingDate(saved, job, today);

  return (
    <li className="flex flex-col gap-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-lg leading-snug">{job ? job.title : "Job details unavailable"}</h3>
          {job && <p className="text-text-muted">{job.company}</p>}
          <p className="text-sm text-text-muted">
            {statusDateLabels[saved.status]} <time dateTime={saved.date}>{formatDate(saved.date)}</time>
          </p>
          {days !== null && days > 0 && <p className="text-sm text-text-muted">No news for {dayCount(days)}</p>}
          {closing && <ClosingDateLine closing={closing} />}
        </div>
        {saved.status === "interview" && (
          <ButtonLink href={`/interview?job=${encodeURIComponent(saved.jobId)}`}>Practise for this interview</ButtonLink>
        )}
      </div>

      <form
        // Not a form action: React resets a form after its action, which would put the status back on screen.
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(() => save({ status, nextStep }));
        }}
        className="grid gap-4 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto] sm:items-end">
        <Field label="Status">
          {(props) => (
            <Select {...props} name="status" value={status} onChange={(event) => setStatus(ApplicationStatusSchema.parse(event.target.value))}>
              {ApplicationStatusSchema.options.map((option) => (
                <option key={option} value={option}>
                  {statusLabels[option]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Next step">
          {(props) => (
            <Input
              {...props}
              name="nextStep"
              value={nextStep}
              onChange={(event) => setNextStep(event.target.value)}
              maxLength={nextStepMaxLength}
              placeholder="For example, follow up by email on Friday"
              autoComplete="off"
            />
          )}
        </Field>
        <Button type="submit" disabled={!unsaved || pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <SaveMessage result={pending ? null : result} unsaved={unsaved} />
      </form>
    </li>
  );
}

/**
 * The job's closing date. A ready application gets a warning, with an icon and words, when 7 days or fewer are
 * left and once the date has passed.
 */
function ClosingDateLine({ closing }: { closing: ClosingDate }) {
  const date = <time dateTime={closing.deadline}>{formatDate(closing.deadline)}</time>;
  const closeEarly = "The employer may close the advert early if they get enough applications";

  switch (closing.alert) {
    case "date":
      return <p className="text-sm text-text-muted">Closing date {date}</p>;
    case "open":
      return (
        <p className="text-sm text-text-muted">
          Closing date {date}. {closeEarly}.
        </p>
      );
    case "soon":
      return (
        <ClosingWarning title={closesIn(closing.daysLeft)}>
          Closing date {date}. {closeEarly}, so apply soon.
        </ClosingWarning>
      );
    case "passed":
      return (
        <ClosingWarning title="The closing date has passed">
          It was {date}. Check the employer&apos;s page before you apply: the advert has probably closed.
        </ClosingWarning>
      );
  }
}

function ClosingWarning({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <p className="mt-1 flex max-w-[65ch] items-start gap-2 rounded-md border border-warning bg-warning-bg px-3 py-2 text-sm text-warning">
      <WarningIcon className="mt-px size-4 shrink-0" />
      <span>
        <span className="font-semibold">{title}.</span> {children}
      </span>
    </p>
  );
}

function closesIn(daysLeft: number): string {
  if (daysLeft === 0) return "Closes today";
  if (daysLeft === 1) return "Closes tomorrow";
  return `Closes in ${daysLeft} days`;
}

type CloseWithoutNewsProps = {
  /** The suggested rows: applied or interview, with no news for 60 days or more. */
  items: TrackedApplication[];
  today: string;
  sample: boolean;
  onClosed: (closed: Application[]) => void;
};

/**
 * A tick box for each suggested row and one button that closes only the ticked ones as No response. Nothing is
 * ticked at first, and nothing is written until the user presses the button.
 */
function CloseWithoutNews({ items, today, sample, onClosed }: CloseWithoutNewsProps) {
  const [ticked, setTicked] = useState<string[]>([]);
  const [result, close, pending] = useActionState<CloseWithoutNewsResult | null, string[]>(async (_previous, ids) => {
    const outcome = sample ? closeSample(items, ids, today) : await closeWithoutNews(ids);
    if (outcome.ok) onClosed(outcome.closed);
    return outcome;
  }, null);

  // Only rows still suggested count: one closed or moved on in its own row drops out of the choice.
  const chosen = ticked.filter((id) => items.some((item) => item.application.id === id));

  return (
    <>
      {items.length > 0 && (
        <section aria-labelledby="no-news-title" className="rounded-lg border border-line bg-surface p-5 sm:p-6">
          <h3 id="no-news-title" className="text-lg leading-snug">
            No news for {noNewsDays} days or more
          </h3>
          <p className="mt-1 max-w-[65ch] text-sm text-text-muted">
            Tick any you want to close as No response. Nothing changes until you press the button, and you can change a
            status back at any time.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              startTransition(() => close(chosen));
            }}
            className="mt-4 flex flex-col items-start gap-4">
            <fieldset className="w-full">
              <legend className="sr-only">Applications to close as No response</legend>
              <ul className="flex flex-col gap-2">
                {items.map(({ application, job }) => (
                  <li key={application.id}>
                    <label className="flex min-h-11 cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        name="close"
                        value={application.id}
                        checked={chosen.includes(application.id)}
                        disabled={pending}
                        onChange={(event) => {
                          const on = event.target.checked;
                          setTicked((previous) => (on ? [...previous, application.id] : previous.filter((id) => id !== application.id)));
                        }}
                        className="mt-0.5 size-5 shrink-0 accent-accent"
                      />
                      <span className="flex flex-col">
                        <span className="font-semibold">{job ? job.title : "Job details unavailable"}</span>
                        <span className="text-sm text-text-muted">
                          {job && `${job.company} · `}No news for {dayCount(daysWithoutNews(application, today) ?? 0)}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
            <Button type="submit" disabled={chosen.length === 0 || pending}>
              {pending ? "Closing…" : chosen.length === 0 ? "Close as No response" : `Close ${chosen.length} as No response`}
            </Button>
          </form>
        </section>
      )}
      <CloseMessage result={pending ? null : result} />
    </>
  );
}

/** What closing did. Stays on the page when the suggestion has gone, so it is still read out. Icon and words. */
function CloseMessage({ result }: { result: CloseWithoutNewsResult | null }) {
  const count = result?.ok ? result.closed.length : null;
  return (
    <>
      <p role="status" className={count === null ? "sr-only" : "flex items-start gap-1.5 text-sm font-semibold text-accent"}>
        {count !== null && count > 0 && (
          <>
            <CheckIcon className="mt-px size-4 shrink-0" />
            Closed {count} {count === 1 ? "application" : "applications"} as No response. Closed applications sit at the bottom
            of your list.
          </>
        )}
        {count === 0 && (
          <>
            <InfoIcon className="mt-px size-4 shrink-0" />
            Nothing was closed: these applications changed since the page loaded. Refresh the page to see where they stand.
          </>
        )}
      </p>
      {result && !result.ok && (
        <p role="alert" className="flex items-start gap-1.5 text-sm text-error">
          <ErrorIcon className="mt-px size-4 shrink-0" />
          {result.message}
        </p>
      )}
    </>
  );
}

/** "Saved" after a save, or what went wrong, across the whole form. Icon and words, never colour alone. */
function SaveMessage({ result, unsaved }: { result: UpdateApplicationResult | null; unsaved: boolean }) {
  const saved = result?.ok && !unsaved;
  // The status line stays on the page (hidden while empty), so screen readers announce "Saved" when it appears.
  return (
    <>
      <p role="status" className={saved ? "flex items-center gap-1.5 text-sm font-semibold text-accent sm:col-span-3" : "sr-only"}>
        {saved && (
          <>
            <CheckIcon className="size-4 shrink-0" />
            Saved
          </>
        )}
      </p>
      {result && !result.ok && (
        <p role="alert" className="flex items-center gap-1.5 text-sm text-error sm:col-span-3">
          <ErrorIcon className="size-4 shrink-0" />
          {result.message}
        </p>
      )}
    </>
  );
}

function changeSample(saved: Application, change: unknown, today: string): UpdateApplicationResult {
  const parsed = ApplicationChangeSchema.safeParse(change);
  if (!parsed.success) {
    return { ok: false, reason: "invalid", message: "Choose a status and keep the next step under 200 characters." };
  }
  return { ok: true, application: applyChange(saved, parsed.data, today) };
}

/** Closes the ticked sample rows on this page only, with the same rule as the server. */
function closeSample(items: TrackedApplication[], ids: string[], today: string): CloseWithoutNewsResult {
  const closed = items
    .filter(({ application }) => ids.includes(application.id) && canCloseWithoutNews(application, today))
    .map(({ application }) => markNoResponse(application, today));
  return { ok: true, closed };
}
