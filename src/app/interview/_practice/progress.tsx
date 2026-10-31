"use client";

// "Preparing your interview" (#232): about 90 seconds from Start to the first question. The wait says how long it
// takes, moves while it runs, and shows what the role asks for as soon as the first stage has read it.
import { useEffect, useState } from "react";
import { startupSeconds } from "@/features/interview/config";
import type { InterviewSession } from "@/features/interview/contracts";
import type { JobState, PracticeStore } from "./store";
import { Button, Card } from "@/shared/ui";
import { Status } from "./ui";

const startupStages = [
  { key: "analyse", label: "Reading the role and your CV" },
  { key: "generate", label: "Writing questions" },
  { key: "review", label: "Checking the questions" },
] as const;

/** How many startup stages are done: 3 once the questions are checked. */
export function stagesDone(session: InterviewSession | null): number {
  return !session ? 0 : !session.questions.length ? 1 : !session.reviewChangelog ? 2 : 3;
}

/**
 * How full the bar is, from 0 to 1: the time so far against the usual wait, but never past the stages that are done,
 * and never short of them. So it only reaches the end when the questions are ready.
 */
export function startupFraction(done: number, elapsedMs: number): number {
  const byTime = elapsedMs / (startupSeconds * 1000);
  return Math.min(Math.max(byTime, done / startupStages.length), (done + 0.9) / startupStages.length);
}

/**
 * What is left of the bar, as "About 90 seconds left" in tens, then "Almost ready". So it jumps with the bar when a
 * stage finishes early, and waits with it when one runs late. Half a minute past the usual wait, it says so.
 */
export function timeLeft(done: number, elapsedMs: number): string {
  if (elapsedMs / 1000 > startupSeconds + 30) return "Taking a little longer than usual";
  const left = Math.round(startupSeconds * (1 - startupFraction(done, elapsedMs)));
  return left > 10 ? `About ${Math.ceil(left / 10) * 10} seconds left` : "Almost ready";
}

/** The time now, once a second while `ticking`. */
function useNow(ticking: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [ticking]);
  return now;
}

export function Progress({
  store,
  session,
  jobs,
  run,
  startedAtMs,
}: {
  store: PracticeStore;
  session: InterviewSession | null;
  jobs: Readonly<Record<string, JobState>>;
  run: string;
  /** When "Start practice" was pressed. */
  startedAtMs: number;
}) {
  const done = stagesDone(session);
  const now = useNow(done < startupStages.length);
  // The first question takes its place. How long the start took is for the lab only (#243).
  if (done === startupStages.length) return null;

  const elapsedMs = Math.max(0, now - startedAtMs);
  const failed = startupStages.some((stage) => jobs[`${run}:${stage.key}`]?.status === "failed");
  // Must-haves first; the role analysis lists 4 to 8.
  const competencies = [...(session?.roleProfile?.competencies ?? [])].sort(
    (a, b) => Number(b.priority === "must-have") - Number(a.priority === "must-have"),
  );
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-xl">Preparing your interview</h2>
        {!failed && <p className="text-sm text-text-muted">{timeLeft(done, elapsedMs)}</p>}
      </div>
      <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-fit">
        <div
          className="h-full rounded-full bg-fit-bar transition-[width] duration-1000 ease-linear motion-reduce:transition-none"
          style={{ width: `${(startupFraction(done, elapsedMs) * 100).toFixed(1)}%` }}
        />
      </div>
      <ol className="space-y-2">
        {startupStages.map((stage, index) => {
          const job = jobs[`${run}:${stage.key}`];
          return (
            <li key={stage.key} className="flex flex-wrap items-center gap-2">
              {index < done ? (
                <Status tone="accent">Done</Status>
              ) : job?.status === "failed" ? (
                <Status tone="error">Failed</Status>
              ) : index === done ? (
                <span className="motion-safe:animate-pulse">
                  <Status tone="muted">Working…</Status>
                </span>
              ) : (
                <Status tone="muted">Waiting</Status>
              )}
              <span>{stage.label}</span>
              {job?.status === "failed" && (
                <>
                  <span className="w-full text-sm text-error">{job.message}</span>
                  <Button onClick={() => store.retryJob(`${run}:${stage.key}`)}>Try again</Button>
                </>
              )}
            </li>
          );
        })}
      </ol>
      {/* The bar and the countdown are for the eyes; a screen reader hears each stage as it finishes. */}
      <p role="status" className="sr-only">
        {done > 0 ? `Done: ${startupStages[done - 1].label}.` : ""}
      </p>
      {competencies.length > 0 && (
        <div className="space-y-2">
          <p className="font-semibold">This interview will test</p>
          <ul className="flex flex-wrap gap-2">
            {competencies.map((competency) => (
              <li key={competency.id} className="rounded-full border border-line px-3 py-1 text-sm">
                {competency.name}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-sm text-text-muted">Keep this page open.</p>
    </Card>
  );
}
