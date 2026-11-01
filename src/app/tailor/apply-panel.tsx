"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { recordApply, type ApplyResult } from "@/features/tailor/actions";
import { ButtonLink, Notice } from "@/shared/ui";
import { unreachableMessage } from "./messages";

/** The site a link really opens, e.g. "linkedin.com". The link is the one the user gave, often a job board, so it is never called the employer's. */
export function linkSite(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/**
 * Apply opens the job ad at the link the user gave, in a new tab, and adds the job to the user's tracker.
 * The app never sends an application on the user's behalf.
 */
export function ApplyPanel({ jobId, jobUrl, onApplied }: { jobId: string; jobUrl: string | null; onApplied: () => void }) {
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [, startTransition] = useTransition();
  // A double click must not record the application twice; the link itself still opens every time.
  const recording = useRef(false);
  const site = jobUrl ? linkSite(jobUrl) : null;

  const onApply = () => {
    if (recording.current || result?.recorded) return;
    recording.current = true;
    startTransition(async () => {
      try {
        const recorded = await recordApply(jobId);
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
          We never apply for you. {site ? `This opens the job ad on ${site}` : "This opens the job ad"} in a new tab, where you send your CV and cover letter yourself.
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
        <Notice tone="warning" title="This job ad has no link">
          We could not find the employer’s application page in the ad. Apply the way the ad describes, for example by email.
        </Notice>
      )}

      {result && (
        <Notice tone={result.recorded ? "success" : "info"} title={result.recorded ? "Added to your applications" : "Not added to your applications"}>
          {result.recorded ? null : result.message}{" "}
          <Link href="/dashboard" className="underline underline-offset-4">
            Go to your dashboard
          </Link>
        </Notice>
      )}
    </section>
  );
}
