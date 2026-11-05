type BrandMarkProps = {
  /** "default" sits on canvas or surface; "on-emphasis" sits on an Ink (or Raised) section. */
  tone?: "default" | "on-emphasis";
  className?: string;
};

// The icon, Tick V: a C and a tick that reads as V. White on a Teal tile in light mode,
// Night on a Lagoon tile in dark mode, Ink on a White tile on emphasis sections (docs/brand.md › Logo).
// Size it with className (size-7 beside the wordmark in the top menu). It is decoration: the
// wordmark or a label beside it carries the name.
export function BrandMark({ tone = "default", className = "" }: BrandMarkProps) {
  const tile = tone === "on-emphasis" ? "fill-on-emphasis" : "fill-mark";
  const glyph = tone === "on-emphasis" ? "stroke-emphasis" : "stroke-on-mark";

  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false" className={`shrink-0 ${className}`}>
      <rect width="100" height="100" rx="23" className={tile} />
      <path d="M49 38A17 17 0 1 0 49 62" fill="none" strokeWidth="11" className={glyph} />
      <path
        d="M56 50 64 61 80 37"
        fill="none"
        strokeWidth="11"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={glyph}
      />
    </svg>
  );
}
