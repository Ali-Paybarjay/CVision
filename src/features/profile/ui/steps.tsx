import { brand } from "@/shared/brand";
import { CheckIcon, cn } from "@/shared/ui";

/** The two steps of building a profile. */
const profileSteps = ["Upload your CV", "Check your details"] as const;

/** The brand's three steps as the pages name them: Build your profile, Paste a job ad, Get a tailored CV… */
export const journeySteps = brand.steps.map((step) => step.title.replace(/\.$/, ""));

type StepsProps = {
  /** The step the user is on, counted from 0. */
  current: number;
  /** The steps' names: the profile's two by default. */
  labels?: readonly string[];
  /** What the list is, for screen readers. */
  label?: string;
  className?: string;
};

/** Where the user is in a short run of steps: done ones ticked, the current one in bold. */
export function Steps({ current, labels = profileSteps, label = "Steps", className }: StepsProps) {
  return (
    <ol aria-label={label} className={cn("flex flex-wrap gap-x-6 gap-y-2 text-sm", className)}>
      {labels.map((name, index) => {
        const done = index < current;
        return (
          <li
            key={name}
            aria-current={index === current ? "step" : undefined}
            className={cn("flex items-center gap-2", index === current ? "font-semibold text-text" : "text-text-muted")}
          >
            {done ? (
              <CheckIcon className="size-6 text-accent" />
            ) : (
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-6 items-center justify-center rounded-full border text-xs",
                  index === current ? "border-text" : "border-line",
                )}
              >
                {index + 1}
              </span>
            )}
            {done && <span className="sr-only">Done: </span>}
            {name}
          </li>
        );
      })}
    </ol>
  );
}
