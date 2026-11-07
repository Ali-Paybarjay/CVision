import Link from "next/link";
import { cn } from "./cn";

/**
 * The three steps of the main path, the same three as brand.steps on the home page, in a few words each. A step
 * before the current one links back to its page; the tailored CV needs a job, so it never links.
 */
const pathSteps = [
  { label: "Your profile", href: "/profile" },
  { label: "Job ad", href: "/jobs" },
  { label: "Tailored CV", href: null },
] as const;

/**
 * Where the user is on the main path, at the top of Profile, Jobs and Tailor (#238). A pilot asked "what should I do
 * now?" on these pages: this says which step of three they are on and what comes next. The current step is in words
 * and bold, not only in colour, and carries aria-current="step" for screen readers. It shows order, not progress:
 * a step before the current one is not marked done, since the page can't always know it is.
 */
export function PathSteps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <nav aria-label="Your progress">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        {pathSteps.map((step, index) => {
          const number = index + 1;
          const here = number === current;
          const circle = (
            <span
              aria-hidden="true"
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs",
                here ? "border-text bg-text font-semibold text-canvas" : "border-line",
              )}
            >
              {number}
            </span>
          );
          return (
            <li key={step.label} className="flex items-center gap-2">
              {index > 0 && <span aria-hidden="true" className="h-px w-3 bg-line sm:w-6" />}
              {number < current && step.href ? (
                <Link href={step.href} className="flex min-h-11 items-center gap-2 text-accent underline-offset-4 hover:underline">
                  {circle}
                  {step.label}
                </Link>
              ) : (
                <span
                  aria-current={here ? "step" : undefined}
                  className={cn("flex min-h-11 items-center gap-2", here ? "font-semibold text-text" : "text-text-muted")}
                >
                  {circle}
                  {step.label}
                  {number === current + 1 && <span className="sr-only"> (next)</span>}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
