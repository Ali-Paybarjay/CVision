import { brand } from "@/shared/brand";

type WordmarkProps = {
  /** "default" sits on canvas or surface; "on-emphasis" sits on an Ink (or Raised) section. */
  tone?: "default" | "on-emphasis";
  className?: string;
};

// Wordmark only: the name in Inter Bold with a Coral full stop. No symbol, no monogram.
// Ink on light, White on dark sections, Chalk in dark mode (all via role tokens).
export function Wordmark({ tone = "default", className = "" }: WordmarkProps) {
  const colour = tone === "on-emphasis" ? "text-on-emphasis" : "text-text";

  return (
    <span className={`font-bold tracking-tight ${colour} ${className}`}>
      {brand.name}
      <span aria-hidden="true" className="text-cta">
        .
      </span>
    </span>
  );
}
