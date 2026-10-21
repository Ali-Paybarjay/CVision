import { cn } from "./cn";

type CardProps = React.HTMLAttributes<HTMLElement> & { as?: "section" | "article" | "div" };

/** A surface panel with a Line edge. */
export function Card({ as: Tag = "section", className, ...props }: CardProps) {
  return <Tag className={cn("rounded-lg border border-line bg-surface p-5 sm:p-6", className)} {...props} />;
}
