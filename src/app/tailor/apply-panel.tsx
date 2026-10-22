"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { recordApply, type ApplyResult } from "@/features/tailor/actions";
import { Card, Notice } from "@/shared/ui";

const linkButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-cta px-5 text-sm font-semibold text-on-cta transition-colors hover:brightness-95";

/**
 * Apply opens the employer's own job page in a new tab and adds the job to the user's tracker.
 * The app never sends an application on the user's behalf.
 */
export function ApplyPanel({ jobId, jobUrl, company }: { jobId: string; jobUrl: string | null; company: string }) {
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [, startTransition] = useTransition();

  const onApply = () =>
    startTransition(async () => {
      setResult(await recordApply(jobId));
    });

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
          <a href={jobUrl} target="_blank" rel="noopener noreferrer" onClick={onApply} className={linkButton}>
            Apply on {company}’s site
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
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
