import { cn } from "./cn";

type FitLineProps = React.HTMLAttributes<HTMLElement> & { as?: "p" | "li" | "div" };

/**
 * The brand signature: a line tailored to the job, on Fit with an accent bar beside it.
 * Inside CvPaper it is always light Fit with a Teal bar; in dark panels it becomes Fit Night with a Lagoon bar.
 */
export function FitLine({ as: Tag = "p", className, ...props }: FitLineProps) {
  return <Tag className={cn("border-l-4 border-fit-bar bg-fit py-1 pr-2 pl-3", className)} {...props} />;
}
