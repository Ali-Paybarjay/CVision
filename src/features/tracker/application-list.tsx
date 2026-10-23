"use client";

import { startTransition, useActionState, useState } from "react";
import { ApplicationStatusSchema, type Application } from "@/shared/contracts";
import { Button, ButtonLink, CheckIcon, ErrorIcon, Field, Input, Select } from "@/shared/ui";
import { updateApplication } from "./actions";
import {
  ApplicationChangeSchema,
  applyChange,
  formatDate,
  londonToday,
  nextStepMaxLength,
  statusDateLabels,
  statusLabels,
  type TrackedApplication,
  type UpdateApplicationResult,
} from "./model";

type ApplicationListProps = {
  items: TrackedApplication[];
  /** Sample rows change on this page only: nothing is sent to the server. */
  sample?: boolean;
};

/** The user's applications, one row each, with the status and next step they can change. */
export function ApplicationList({ items, sample = false }: ApplicationListProps) {
  return (
    <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
      {items.map((item) => (
        <ApplicationRow key={item.application.id} item={item} sample={sample} />
      ))}
    </ul>
  );
}

function ApplicationRow({ item, sample }: { item: TrackedApplication; sample: boolean }) {
  const [saved, setSaved] = useState(item.application);
  const [status, setStatus] = useState(saved.status);
  const [nextStep, setNextStep] = useState(saved.nextStep ?? "");
  const [result, save, pending] = useActionState<UpdateApplicationResult | null, { status: string; nextStep: string }>(async (_previous, change) => {
    const outcome = sample ? changeSample(saved, change) : await updateApplication(saved.id, change);
    if (outcome.ok) setSaved(outcome.application);
    return outcome;
  }, null);

  const unsaved = status !== saved.status || nextStep.trim() !== (saved.nextStep ?? "");
  const { job } = item;

  return (
    <li className="flex flex-col gap-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-lg leading-snug">{job ? job.title : "Job details unavailable"}</h3>
          {job && <p className="text-text-muted">{job.company}</p>}
          <p className="text-sm text-text-muted">
            {statusDateLabels[saved.status]} <time dateTime={saved.date}>{formatDate(saved.date)}</time>
          </p>
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

function changeSample(saved: Application, change: unknown): UpdateApplicationResult {
  const parsed = ApplicationChangeSchema.safeParse(change);
  if (!parsed.success) {
    return { ok: false, reason: "invalid", message: "Choose a status and keep the next step under 200 characters." };
  }
  return { ok: true, application: applyChange(saved, parsed.data, londonToday()) };
}
