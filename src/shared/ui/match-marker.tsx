import { cn } from "./cn";

/**
 * Plan A's numbered Teal circle (principle 2): the same number on a tailored CV line and on the job ad's requirement
 * that asked for it, so the user sees why each line changed. A screen reader hears "Line 1". A number of two digits
 * stretches the circle rather than shrinking the figures.
 */
export function MatchMarker({ line, className }: { line: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-accent px-1 text-[11px] leading-none font-bold tracking-normal text-surface tabular-nums",
        className,
      )}
    >
      <span className="sr-only">Line </span>
      {line}
    </span>
  );
}
