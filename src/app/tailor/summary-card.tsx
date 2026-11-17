"use client";

import { useRef, useState, useTransition } from "react";
import { writeSummaryForJob } from "@/features/tailor/actions";
import { defaultDescribeAs, MAX_OWN_WORDS, summaryOptions, type DescribeAs } from "@/features/tailor/summary-options";
import type { Profile, TailoringChange } from "@/shared/contracts";
import { Button, cn, Field, Input, Notice, WaitNote } from "@/shared/ui";
import { ChangeCard, type LineNote } from "./change-card";
import { unreachableMessage } from "./messages";

type SummaryCardProps = {
  jobId: string;
  profile: Profile;
  /** The summaries written for this job, saved or new; changes from answers stay with their question. */
  changes: TailoringChange[];
  onWritten: (change: TailoringChange) => void;
  onDecide: (change: TailoringChange) => Promise<void>;
  lineNoteOf?: (change: TailoringChange) => LineNote | undefined;
};

/** The radio value of each choice: "summary", "own", or "title:<index>". */
function valueOf(describeAs: DescribeAs, titles: string[]): string {
  return describeAs.kind === "title" ? `title:${titles.indexOf(describeAs.title)}` : describeAs.kind;
}

/**
 * The professional summary, first in the review step because a recruiter reads it first (#16). Before it is written
 * the user says how it should describe them: as their summary does now, by a job title from their CV, or in their own
 * words. The job ad's title is never offered: a user for whom it is true types it themselves.
 */
export function SummaryCard({ jobId, profile, changes, onWritten, onDecide, lineNoteOf }: SummaryCardProps) {
  const { hasSummary, titles } = summaryOptions(profile);
  const [choice, setChoice] = useState<DescribeAs>(() => defaultDescribeAs(profile));
  const [words, setWords] = useState("");
  const [asking, setAsking] = useState(changes.length === 0);
  const [result, setResult] = useState<{ message: string; fits: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  // The button pressed disappears when the question opens or closes, so focus goes to the card's heading instead.
  const heading = useRef<HTMLHeadingElement>(null);
  const ask = (open: boolean) => {
    setAsking(open);
    requestAnimationFrame(() => heading.current?.focus());
  };

  const describeAs: DescribeAs = choice.kind === "own" ? { kind: "own", words } : choice;
  const ready = choice.kind !== "own" || words.trim() !== "";

  const write = () => {
    setResult(null);
    startTransition(async () => {
      try {
        const written = await writeSummaryForJob(jobId, describeAs);
        if (!written.ok) return setResult({ message: written.message, fits: written.fits === true });
        onWritten(written.change);
        ask(false);
      } catch {
        setResult({ message: unreachableMessage, fits: false });
      }
    });
  };

  const options: { value: string; label: string; describeAs: DescribeAs }[] = [
    ...(hasSummary ? [{ value: "summary", label: "As my summary says now", describeAs: { kind: "summary" } as const }] : []),
    ...titles.map((title, index) => ({ value: `title:${index}`, label: title, describeAs: { kind: "title", title } as const })),
    { value: "own", label: "In my own words", describeAs: { kind: "own", words: "" } as const },
  ];
  const selected = valueOf(choice, titles);

  return (
    <section className="flex flex-col gap-4 rounded-md border-2 border-accent p-4" aria-labelledby="summary-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 id="summary-heading" ref={heading} tabIndex={-1} className="font-semibold">
          Professional summary
        </h4>
        <span className="text-sm font-semibold text-accent">Recruiters read this first</span>
      </div>

      {asking && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (ready && !pending) write();
          }}
        >
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-semibold">How should your summary describe you?</legend>
            {options.map((option) => (
              <label
                key={option.value}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-4 py-2 text-sm",
                  selected === option.value ? "border-accent bg-fit font-semibold" : "border-line",
                )}
              >
                <input
                  type="radio"
                  name="describe-as"
                  value={option.value}
                  checked={selected === option.value}
                  onChange={() => setChoice(option.describeAs)}
                  disabled={pending}
                  className="size-4 shrink-0 accent-accent"
                />
                {option.label}
              </label>
            ))}
          </fieldset>
          {choice.kind === "own" && (
            <Field label="Your words" hint={`For example: Mechanical design engineer. Up to ${MAX_OWN_WORDS} characters.`}>
              {(props) => <Input {...props} value={words} maxLength={MAX_OWN_WORDS} onChange={(event) => setWords(event.target.value)} disabled={pending} />}
            </Field>
          )}
          <p className="text-sm text-text-muted">We don&rsquo;t give you the job ad&rsquo;s title. If it is true for you, type it in your own words.</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={pending || !ready}>
              Write my summary
            </Button>
            {changes.length > 0 && (
              <Button variant="quiet" onClick={() => (ask(false), setResult(null))} disabled={pending}>
                Cancel
              </Button>
            )}
          </div>
          <WaitNote>{pending ? "Writing your summary… This takes a few seconds." : null}</WaitNote>
          {result && (
            <Notice tone={result.fits ? "success" : "error"} title={result.fits ? "No change needed" : "No summary yet"}>
              {result.message}
            </Notice>
          )}
        </form>
      )}

      {changes.map((change) => (
        <ChangeCard key={change.id} change={change} onDecide={onDecide} lineNote={lineNoteOf?.(change)} showSection={false} />
      ))}

      {!asking && (
        <div>
          <Button variant="quiet" onClick={() => ask(true)}>
            Try another title
          </Button>
        </div>
      )}
    </section>
  );
}
