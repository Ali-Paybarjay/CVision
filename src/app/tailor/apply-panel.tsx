"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { recordApply, type ApplyResult } from "@/features/tailor/actions";
import { ButtonLink, Card, Notice } from "@/shared/ui";
import { unreachableMessage } from "./messages";

/**
 * Apply opens the employer's own job page in a new tab and adds the job to the user's tracker.
 * The app never sends an application on the user's behalf.
 */
export function ApplyPanel({ jobId, jobUrl, company }: { jobId: string; jobUrl: string | null; company: string }) {
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [, startTransition] = useTransition();
  // A double click must not record the application twice; the link itself still opens every time.
  const recording = useRef(false);

  const onApply = () => {
    if (recording.current || result?.recorded) return;
    recording.current = true;
    startTransition(async () => {
      try {
        setResult(await recordApply(jobId));
      } catch {
        setResult({ recorded: false, message: unreachableMessage });
      } finally {
        recording.current = false;
      }
    });
  };

  return (
    <Card as="section" aria-labelledby="apply-heading" className="flex flex-col gap-4">
      <div>
        <h2 id="apply-heading" className="text-xl">
          Apply
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          We never apply for you. Apply opens {company}’s own job page in a new tab, where you send your CV and cover letter yourself.
        </p>
      </div>

      {jobUrl ? (
        <div>
          {/* A real link, so the employer's page opens even if recording the application fails. */}
          <ButtonLink href={jobUrl} variant="primary" target="_blank" rel="noopener noreferrer" onClick={onApply}>
            Apply on {company}’s site
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
    </Card>
  );
}
