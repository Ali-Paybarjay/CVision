"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { recordApply, type ApplyResult } from "@/features/tailor/actions";
import { Button, ButtonLink, Notice } from "@/shared/ui";
import { saveFailedMessage, unreachableMessage } from "./messages";

/** The site a link really opens, e.g. "linkedin.com". The link is the one the user gave, often a job board, so it is never called the employer's. */
export function linkSite(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/** The interview practice for this job. Kept here rather than imported from the tracker, so this Client Component pulls in nothing else. */
export function interviewPracticePath(jobId: string): string {
  return `/interview?job=${encodeURIComponent(jobId)}`;
}

/**
 * Apply opens the job ad at the link the user gave, in a new tab, and adds the job to the user's tracker.
 * An ad with no link, such as one pasted as text, has an "I’ve applied" button instead, which only adds the job (#498).
 * The app never sends an application on the user's behalf.
 */
export function ApplyPanel({
  jobId,
  jobUrl,
  coverLetter = null,
  onApplied,
}: {
  jobId: string;
  jobUrl: string | null;
  /** The approved cover letter, saved with the CV when the user presses Apply (#207). */
  coverLetter?: string | null;
  onApplied: () => void;
}) {
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [pending, startTransition] = useTransition();
  // A double click must not record the application twice; the link itself still opens every time.
  const recording = useRef(false);
  const site = jobUrl ? linkSite(jobUrl) : null;

  const onApply = () => {
    if (recording.current || result?.recorded) return;
    recording.current = true;
    startTransition(async () => {
      try {
        const recorded = await recordApply(jobId, coverLetter);
        setResult(recorded);
        if (recorded.recorded) onApplied();
      } catch {
        setResult({ recorded: false, message: unreachableMessage });
      } finally {
        recording.current = false;
      }
    });
  };

  return (
    <section aria-labelledby="apply-heading" className="flex flex-col gap-4 border-t border-line pt-5">
      <div>
        <h4 id="apply-heading" className="font-semibold">
          Apply
        </h4>
        <p className="mt-1 text-sm text-text-muted">
          We never apply for you.{" "}
          {jobUrl ? (
            <>{site ? `This opens the job ad on ${site}` : "This opens the job ad"} in a new tab, where you send your CV and cover letter yourself.</>
          ) : (
            "You send your CV and cover letter yourself."
          )}
        </p>
      </div>

      {jobUrl ? (
        <div>
          {/* A real link, so the ad opens even if recording the application fails. */}
          <ButtonLink href={jobUrl} variant="primary" target="_blank" rel="noopener noreferrer" onClick={onApply}>
            {site ? `Open the ad on ${site}` : "Open the job ad"}
            <span className="sr-only"> (opens in a new tab)</span>
          </ButtonLink>
        </div>
      ) : (
        <>
          <Notice tone="info" title="This job ad has no link">
            Apply the way the ad describes, for example by email. Then add the job to your applications, so you can follow it up from your dashboard.
          </Notice>
          <div>
            {/* No ad to open, so this button only records the application, with the same guard against a double click.
                No new tab shows that it worked, so its label says so while it records; it stays enabled to keep the focus on it. */}
            <Button variant="primary" onClick={onApply}>
              {pending ? "Adding it to your applications…" : "I’ve applied: add it to my applications"}
            </Button>
          </div>
        </>
      )}

      {result && (
        <Notice tone={result.recorded ? "success" : "info"} title={result.recorded ? "Added to your applications" : "Not added to your applications"}>
          {result.recorded ? null : result.message}{" "}
          <Link href="/dashboard" className="underline underline-offset-4">
            Go to your dashboard
          </Link>
        </Notice>
      )}
      {result?.saveFailed && <p className="text-sm text-text-muted">{saveFailedMessage}</p>}

      {/* The next step after applying, shown before and after Apply. "Open the ad", or "I’ve applied" for an ad with no link,
          stays the step's one Coral button, and "practice" is a noun only, as on the dashboard (#258) and in the interview section (#239). */}
      <div className="flex flex-col items-start gap-2 border-t border-line pt-4">
        <p className="text-sm text-text-muted">Get ready for this job’s interview questions while you wait to hear back.</p>
        <ButtonLink href={interviewPracticePath(jobId)}>Start interview practice</ButtonLink>
      </div>
    </section>
  );
}
