// What the user sees while a slow request runs: a turning ring and a sentence, such as "Reading your CV. This can
// take up to a minute." The sentence sits in a live region that is always on the page, so a screen reader reads it
// when it appears and again when it changes (issue #235: the sentence used to be for screen readers only).
import { cn } from "./cn";

type WaitNoteProps = {
  /** The sentence while waiting. Nothing (false, null or "") while no request is running: the region stays empty. */
  children?: React.ReactNode;
  /** Spacing for the sentence, such as "mt-3". The empty region takes no space. */
  className?: string;
};

export function WaitNote({ children, className }: WaitNoteProps) {
  return (
    <div aria-live="polite">
      {children ? (
        <p className={cn("flex items-start gap-2 text-sm text-text-muted", className)}>
          <TurningRing />
          <span>{children}</span>
        </p>
      ) : null}
    </div>
  );
}

/** Only the ring turns, so the words keep their full contrast; with reduced motion it stands still. */
function TurningRing() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      aria-hidden="true"
      className="mt-0.5 size-4 shrink-0 text-accent motion-safe:animate-spin"
    >
      <circle cx="12" cy="12" r="9" opacity="0.25" />
      <path d="M12 3a9 9 0 0 1 9 9" />
    </svg>
  );
}
