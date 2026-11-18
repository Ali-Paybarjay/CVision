"use client";

import { useEffect, useRef } from "react";
import type { Gap, Job, JobConditionKind, MatchResult } from "@/shared/contracts";
import { Button, ButtonLink, Card, CheckIcon, InfoIcon, Notice, WarningIcon } from "@/shared/ui";
import type { SaveState } from "../job-actions";
import { conditionGroups, type ConditionGroup } from "../job-conditions";
import { defaultDetail } from "../match";
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
  const conditions = conditionGroups(job);
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
            your profile shows clearly counts in full, and one marked “{gapLabel.unclear}”
            {match.gaps.some(isUnchecked) && ` or “${uncheckedLabel}”`} counts half.
          </p>
        )}
      </Card>

      {/* A pilot tailored for a job far from their field and found the questions no use (#338): say so in amber under
          the score, so it is read before the Tailor button, which stays on screen (#503). */}
      {canTailor && hasRequirements && fitLabel(match.score) === "Several gaps" && (
        <Notice tone="warning" title="This job is a long way from your profile">
          It asks for a lot your profile doesn’t show yet. Tailoring only rewords what you’ve told us, so it can’t fill
          those gaps. You can still tailor your CV for it, or check a job closer to your experience.
        </Notice>
      )}

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

      {conditions.length > 0 && <ConditionsCard groups={conditions} />}

      {saved === "signed-out" && <SignInNotice title="Sign in to keep this job" next="/jobs" />}
      {saved === "failed" && (
        <Notice tone="warning" title="This job isn’t saved to your account">
          We couldn’t save it just now. Your report is still here. To tailor your CV for this job, check it again in a
          minute.
        </Notice>
      )}

      {/*
        On a phone the report is about two screens long, so the way on to Tailor stays on screen while it scrolls under
        it, like the profile's Approve bar (#362). At the end of the report the bar settles above the other two links.
      */}
      {canTailor && (
        <div className="sticky bottom-0 z-10 border-t border-line bg-canvas py-3 [:root:has(&)]:scroll-pb-28">
          <ButtonLink href={`/tailor?job=${encodeURIComponent(job.id)}`} variant="primary" className="w-full sm:w-auto">
            Tailor my CV for this job
          </ButtonLink>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
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

/** What each kind of gap is called on the page (#188): a word, so the kind never rests on colour alone. */
export const gapLabel: Record<Gap["kind"], string> = {
  unclear: "Partly shown",
  missing: "Not shown yet",
};

/**
 * An "unclear" gap the match couldn't check (#527): the model skipped it, or called it met with no profile line behind
 * it. "Partly shown" would say the profile shows some of it, which nobody saw. It still counts half, like any unclear gap.
 */
const uncheckedLabel = "Not checked";
const uncheckedDetails: readonly string[] = [defaultDetail.unchecked, defaultDetail.noEvidence];

function isUnchecked(gap: Gap): boolean {
  return gap.kind === "unclear" && uncheckedDetails.includes(gap.detail);
}

/** Only an essential gap is amber (#503): with every gap amber, the report read like a list of errors. */
const gapLook: Record<Gap["importance"], { Icon: typeof WarningIcon; icon: string; label: string }> = {
  essential: { Icon: WarningIcon, icon: "text-warning", label: "bg-warning-bg text-warning" },
  desirable: { Icon: InfoIcon, icon: "text-text-muted", label: "border border-line text-text-muted" },
};

function GapList({ title, gaps }: { title: string; gaps: Gap[] }) {
  if (gaps.length === 0) return null;
  return (
    <div className="mt-5">
      <h4 className="text-sm font-semibold text-text-muted">
        {title} ({gaps.length})
      </h4>
      <ul className="mt-3 flex flex-col gap-4">
        {gaps.map((gap) => {
          // Only a gap the profile partly shows quotes it, and only lines the code copied from the profile (#188).
          const lines = gap.kind === "unclear" ? (gap.evidence ?? []) : [];
          const look = gapLook[gap.importance];
          return (
            <li key={gap.id} className="flex gap-3">
              <look.Icon className={`mt-0.5 size-5 shrink-0 ${look.icon}`} />
              <div className="min-w-0">
                <p className="font-semibold">{gap.requirement}</p>
                <p className="mt-1">
                  <span className={`inline-flex rounded-md px-2 py-0.5 text-[12.5px] font-semibold ${look.label}`}>
                    {isUnchecked(gap) ? uncheckedLabel : gapLabel[gap.kind]}
                  </span>
                </p>
                {/* The stock sentence only repeats "Not shown yet" (#503). One the model wrote can say more, such as
                    which tool the profile shows instead, so it stays. */}
                {gap.detail !== defaultDetail.missing && <p className="mt-1 text-sm text-text-muted">{gap.detail}</p>}
                {lines.length === 1 && (
                  <p className="mt-1 text-sm text-text-muted">
                    From your profile: <q className="break-words">{lines[0]}</q>
                  </p>
                )}
                {lines.length > 1 && (
                  <>
                    <p className="mt-1 text-sm text-text-muted">From your profile:</p>
                    <ul className="mt-1 flex flex-col gap-1 text-sm text-text-muted">
                      {lines.map((line) => (
                        <li key={line}>
                          <q className="break-words">{line}</q>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const conditionTitles: Record<JobConditionKind, string> = {
  credential: "Licences and cards",
  working: "Working conditions",
  sensitive: "For you to check",
};

/** The job's conditions, such as a driving licence or night shifts, apart from the score (#222). */
function ConditionsCard({ groups }: { groups: ConditionGroup[] }) {
  return (
    <Card>
      <h3 className="text-xl">Other things this job asks for</h3>
      <p className="mt-2 max-w-[65ch] text-text-muted">
        We don’t count these in your score. Check each one before you apply.
      </p>
      {groups.map((group) => (
        <div key={group.kind} className="mt-5">
          <h4 className="text-sm font-semibold text-text-muted">{conditionTitles[group.kind]}</h4>
          <ul className="mt-3 flex list-disc flex-col gap-2 pl-5">
            {group.items.map((item) => (
              <li key={item.requirement}>
                {item.requirement}
                {item.desirable && <span className="text-text-muted"> (desirable)</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Card>
  );
}

/** A plain label next to the score, so the number never stands alone. */
export function fitLabel(score: number): string {
  if (score >= 75) return "Strong fit";
  if (score >= 50) return "Partial fit";
  return "Several gaps";
}
