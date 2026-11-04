import { cn } from "./cn";
import { CheckIcon, WarningIcon } from "./icons";
import { MatchMarker } from "./match-marker";

/** Where a job ad's requirement stands against the CV. */
export type RequirementStatus = "matched" | "tailored" | "missing";

export const statusWords: Record<RequirementStatus, string> = {
  matched: "Matched",
  tailored: "Tailored",
  missing: "Not on your CV",
};

type StatusChipProps = {
  status: RequirementStatus;
  /** For a tailored requirement: the number of the CV line that answers it, shown as its MatchMarker. */
  line?: number;
  className?: string;
};

/**
 * Plan A's status (principle 7): an icon and a word, never colour alone. "Matched" in Teal, "Tailored" on Fit with
 * the line's number ("Tailored, line 1" to a screen reader), "Not on your CV" in the warning colour.
 */
export function StatusChip({ status, line, className }: StatusChipProps) {
  const base = "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[12.5px] font-semibold";
  if (status === "missing") {
    return (
      <span className={cn(base, "bg-warning-bg text-warning", className)}>
        <WarningIcon className="size-3.5 shrink-0" />
        {statusWords.missing}
      </span>
    );
  }
  if (status === "tailored") {
    return (
      <span className={cn(base, "bg-fit text-accent", className)}>
        {line !== undefined ? (
          // The chip says "Tailored, line 1" itself, so the circle's own "Line 1" is not read a second time.
          <span aria-hidden="true" className="flex">
            <MatchMarker line={line} />
          </span>
        ) : (
          <CheckIcon className="size-3.5 shrink-0" />
        )}
        {statusWords.tailored}
        {line !== undefined && <span className="sr-only">, line {line}</span>}
      </span>
    );
  }
  return (
    <span className={cn(base, "text-accent", className)}>
      <CheckIcon className="size-3.5 shrink-0" />
      {statusWords.matched}
    </span>
  );
}
