import { cn } from "./cn";

type SectionLabelProps = React.HTMLAttributes<HTMLElement> & {
  /** A heading when it names a section (h2 to h4), a paragraph when it only labels what follows. */
  as?: "p" | "span" | "h2" | "h3" | "h4";
  /** large: 13px, above a page title. Otherwise 11px, in cards and lists. */
  size?: "default" | "large";
};

/** Plan A's small capitals label (docs/design/paper-desk, principle 4), such as "THE JOB AD" or "ESSENTIAL". */
export function SectionLabel({ as: Tag = "p", size = "default", className, ...props }: SectionLabelProps) {
  return (
    <Tag
      className={cn(
        "font-bold tracking-[0.1em] text-text-muted uppercase",
        size === "large" ? "text-[13px]" : "text-[11px]",
        className,
      )}
      {...props}
    />
  );
}
