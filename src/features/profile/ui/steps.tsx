import { CheckIcon, cn } from "@/shared/ui";

const steps = ["Upload your CV", "Check your details", "Add the detail"] as const;

/** Where the user is in the three steps of building a profile. */
export function Steps({ current }: { current: 0 | 1 | 2 }) {
  return (
    <ol aria-label="Steps" className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
      {steps.map((label, index) => {
        const done = index < current;
        return (
          <li
            key={label}
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
            {label}
          </li>
        );
      })}
    </ol>
  );
}
