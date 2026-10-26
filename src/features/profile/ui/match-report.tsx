"use client";

import { useEffect, useRef } from "react";
import type { Gap, Job, MatchResult } from "@/shared/contracts";
import { Button, ButtonLink, Card, CheckIcon, Notice, WarningIcon } from "@/shared/ui";
import type { SaveState } from "../job-actions";
import { jobFacts } from "./format";
import { SignInNotice } from "./upload-step";

type MatchReportProps = {
  job: Job;
  match: MatchResult;
  saved: SaveState;
  /** Set in mock mode: the job is a sample one, and `sampleProfile` names the sample person used when there was no profile. */
  demo: { sampleProfile: string | null } | null;
  focusHeading: boolean;
  onCheckAnother: () => void;
};

/** How well the user's profile fits one job: the score, where they match, the gaps, and the way on to tailoring. */
export function MatchReport({ job, match, saved, demo, focusHeading, onCheckAnother }: MatchReportProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const hasRequirements = match.strengths.length + match.gaps.length > 0;
  const essentialGaps = match.gaps.filter((gap) => gap.importance === "essential");
  const desirableGaps = match.gaps.filter((gap) => gap.importance === "desirable");
  // /tailor reads the job from the user's account, or in the demo from the sample data (see checkJobAction).
  // A job that wasn't saved isn't in either, so the button would open a different job.
  const canTailor = saved === "saved" || (demo !== null && saved !== "failed");

  useEffect(() => {
    if (focusHeading) headingRef.current?.focus();
  }, [focusHeading]);

  return (
    <section aria-labelledby="match-heading" className="flex flex-col gap-6">
      {demo && (
        <Notice tone="warning" title="Demo mode: sample job and simple rules">
          CVision isn’t connected to the AI yet, so this is a sample job, matched by looking for the ad’s words in the
          profile. {demo.sampleProfile && `You have no profile yet, so this uses ${demo.sampleProfile}’s sample profile.`}
        </Notice>
      )}

      <Card>
        <p className="text-sm text-text-muted">Your fit for</p>
        <h2 id="match-heading" ref={headingRef} tabIndex={-1} className="mt-1 text-2xl">
          {job.title}
        </h2>
        <p className="mt-1 font-semibold">{job.company}</p>
        {jobFacts(job).length > 0 && <p className="mt-1 text-text-muted">{jobFacts(job).join(" · ")}</p>}

        {hasRequirements ? (
          <>
            <div className="mt-6 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <p className="flex items-baseline gap-2">
                <span className="text-5xl leading-none font-bold">{match.score}</span>
                <span className="text-text-muted">out of 100</span>
              </p>
              <p className="font-semibold">{fitLabel(match.score)}</p>
            </div>
            <div aria-hidden="true" className="mt-3 h-2 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-accent" style={{ width: `${match.score}%` }} />
            </div>
          </>
        ) : null}
        <p className="mt-4 max-w-[65ch]">{match.reasoning}</p>
        {hasRequirements && (
          <p className="mt-3 max-w-[65ch] text-sm text-text-muted">
            How the score works: essential requirements count three times as much as desirable ones. A requirement
            your profile shows clearly counts in full, and one it only touches on counts half.
          </p>
        )}
      </Card>

      {hasRequirements && (
        <Card>
          <h3 className="text-xl">Where you already match</h3>
          {match.strengths.length > 0 ? (
            <ul className="mt-4 flex flex-col gap-4">
              {match.strengths.map((strength) => (
                <li key={strength.requirement} className="flex gap-3">
                  <CheckIcon className="mt-0.5 size-5 shrink-0 text-accent" />
                  <div className="min-w-0">
                    <p className="font-semibold">
                      <span className="sr-only">Matched: </span>
                      {strength.requirement}
                    </p>
                    <p className="mt-1 text-sm text-text-muted">
                      From your profile: <q className="break-words">{strength.evidence}</q>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-text-muted">Your profile doesn’t clearly show any of this ad’s requirements yet.</p>
          )}
        </Card>
      )}

      {match.gaps.length > 0 && (
        <Card>
          <h3 className="text-xl">Gaps to look at</h3>
          <p className="mt-2 max-w-[65ch] text-text-muted">
            Before tailoring, we ask you about each one. We only add what you confirm, in your own words.
          </p>
          <GapList title="Essential" gaps={essentialGaps} />
          <GapList title="Desirable" gaps={desirableGaps} />
        </Card>
      )}

      {saved === "signed-out" && <SignInNotice title="Sign in to keep this job" next="/jobs" />}
      {saved === "failed" && (
        <Notice tone="warning" title="This job isn’t saved to your account">
          We couldn’t save it just now. Your report is still here. To tailor your CV for this job, check it again in a
          minute.
        </Notice>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        {canTailor && (
          <ButtonLink href={`/tailor?job=${encodeURIComponent(job.id)}`} variant="primary">
            Tailor my CV for this job
          </ButtonLink>
        )}
        {/* /jobs/linkedin reads the job the same way as /tailor, so it needs the same saved job. */}
        {canTailor && (
          <ButtonLink href={`/jobs/linkedin?job=${encodeURIComponent(job.id)}`}>Suggest LinkedIn lines for this job</ButtonLink>
        )}
        <Button onClick={onCheckAnother}>Check another job</Button>
        {job.url && (
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center px-1 text-sm font-semibold text-accent underline-offset-4 hover:underline"
          >
            Open the original ad<span className="sr-only"> (opens in a new tab)</span>
          </a>
        )}
      </div>
    </section>
  );
}

function GapList({ title, gaps }: { title: string; gaps: Gap[] }) {
  if (gaps.length === 0) return null;
  return (
    <div className="mt-5">
      <h4 className="text-sm font-semibold text-text-muted">
        {title} ({gaps.length})
      </h4>
      <ul className="mt-3 flex flex-col gap-4">
        {gaps.map((gap) => (
          <li key={gap.id} className="flex gap-3">
            <WarningIcon className="mt-0.5 size-5 shrink-0 text-warning" />
            <div className="min-w-0">
              <p className="font-semibold">{gap.requirement}</p>
              <p className="mt-1 text-sm text-text-muted">{gap.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A plain label next to the score, so the number never stands alone. */
export function fitLabel(score: number): string {
  if (score >= 75) return "Strong fit";
  if (score >= 50) return "Partial fit";
  return "Several gaps";
}
