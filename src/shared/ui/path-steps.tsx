import Link from "next/link";
import { cn } from "./cn";

/**
 * The three steps of the main path, the same three as brand.steps on the home page, in a word or two each. A step
 * before the current one links back to its page; the tailored CV needs a job, so it never links.
 */
const pathSteps = [
  { label: "Profile", href: "/profile" },
  { label: "Job ad", href: "/jobs" },
  { label: "Tailored CV", href: null },
] as const;

/**
 * Where the user is on the main path, at the top of Profile, Jobs and Tailor (#238). A pilot asked "what should I do
 * now?" on these pages: this says which step of three they are on and what comes next, in words ("Step 2 of 3"),
 * with the current step in bold. It is one short line with no numbered circles, so on a phone it fits on one line
 * and it doesn't look like the pages' own steps below it (Profile's two, Tailor's five). Each step is a page, so the
 * current one carries aria-current="page", not "step", which those inner steps use. It shows order, not progress: a
 * step before the current one is not marked done, since the page can't always know it is.
 */
export function PathSteps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <nav aria-label="Your progress" className="flex flex-wrap items-center gap-x-3 text-sm">
      <p className="font-semibold text-text-muted">
        Step {current} of {pathSteps.length}
      </p>
      <ol className="flex flex-wrap items-center gap-x-1.5">
        {pathSteps.map((step, index) => {
          const number = index + 1;
          const here = number === current;
          return (
            <li key={step.label} className="flex items-center gap-x-1.5">
              {index > 0 && (
                <span aria-hidden="true" className="text-text-muted">
                  ›
                </span>
              )}
              {number < current && step.href ? (
                <Link href={step.href} className="inline-flex min-h-11 items-center text-accent underline-offset-4 hover:underline">
                  {step.label}
                </Link>
              ) : (
                <span
                  aria-current={here ? "page" : undefined}
                  className={cn("inline-flex min-h-11 items-center", here ? "font-semibold text-text" : "text-text-muted")}
                >
                  {step.label}
                  {number === current + 1 && <span className="sr-only">&nbsp;(next)</span>}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
