import type { CvIssue } from "@/shared/contracts";
import { cn } from "@/shared/ui";
import { severityLabels } from "../result-text";

export const SEVERITIES = ["high", "medium", "low"] as const;
export type IssueCounts = Record<CvIssue["severity"], number>;

/** How many issues of each kind a check found. */
export function countIssues(issues: CvIssue[]): IssueCounts {
  return {
    high: issues.filter((issue) => issue.severity === "high").length,
    medium: issues.filter((issue) => issue.severity === "medium").length,
    low: issues.filter((issue) => issue.severity === "low").length,
  };
}

/** Each kind of issue has its own colour, from the brand's tokens, so the three bars tell apart at a glance. */
const severityBar: Record<CvIssue["severity"], string> = {
  high: "bg-warning",
  medium: "bg-fit-bar",
  low: "bg-text-muted",
};

const sizes = {
  default: { ring: "size-36", score: "text-4xl", label: "text-xs", bars: "gap-4 text-sm" },
  // The label fits inside the smaller ring only a size down.
  compact: { ring: "size-28", score: "text-3xl", label: "text-[0.625rem]", bars: "gap-2.5 text-xs" },
};

/**
 * The CV check's score as a ring, and beside it how many issues of each kind it found: the ring fills to the score,
 * and each bar to its share of the issues. In the result every number is the check's own. `example` draws the same
 * picture with sample numbers where there is no result (Profile): it is hidden from screen readers and is no meter,
 * so it can't be read as the user's score, and the page around it must say it is an example.
 */
export function ScoreOverview({
  score,
  counts,
  size = "default",
  example = false,
}: {
  score: number;
  counts: IssueCounts;
  size?: keyof typeof sizes;
  example?: boolean;
}) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const total = counts.high + counts.medium + counts.low;
  const look = sizes[size];
  const meter = example
    ? {}
    : {
        role: "meter",
        "aria-label": "Readiness score",
        "aria-valuemin": 0,
        "aria-valuemax": 100,
        "aria-valuenow": score,
        "aria-valuetext": `${score} out of 100`,
      };

  return (
    <div
      className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-6"
      aria-hidden={example ? true : undefined}
    >
      <div {...meter} className={cn("relative shrink-0", look.ring)}>
        <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden="true">
          <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="9" className="stroke-fit" />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={`${(circumference * score) / 100} ${circumference}`}
            className="stroke-fit-bar"
          />
        </svg>
        <span className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
          <span className={cn("font-bold leading-none text-text tabular-nums", look.score)}>{score}%</span>
          {/* An example says so inside the ring too, so its number is never read as the user's own score (#556). */}
          <span className={cn("mt-1 text-text-muted", look.label)}>{example ? "Example" : "Overall score"}</span>
        </span>
      </div>

      <ul className={cn("flex w-full min-w-0 flex-col", look.bars)}>
        {SEVERITIES.map((severity) => {
          const count = counts[severity];
          return (
            <li key={severity} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">{severityLabels[severity]}</span>
                <span className="text-text-muted tabular-nums">
                  {count} {count === 1 ? "issue" : "issues"}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-canvas" aria-hidden="true">
                <div
                  className={cn("h-full rounded-full", severityBar[severity])}
                  style={{ width: total === 0 ? "0%" : `${(count / total) * 100}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
