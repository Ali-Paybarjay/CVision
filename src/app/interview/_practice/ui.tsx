// The status chip for interview practice, in the brand's role tokens. Cards, notices and buttons come from @/shared/ui.
import type { ReactNode } from "react";

/** `working`: a request is running right now (a turning ring). `pending`: waits its turn (an empty ring). */
export type Tone = "accent" | "warning" | "error" | "muted" | "working" | "pending";

const toneClasses: Record<Tone, string> = {
  accent: "bg-fit text-accent",
  warning: "bg-warning-bg text-warning",
  error: "bg-surface text-error border border-error",
  muted: "bg-canvas text-text-muted border border-line",
  working: "bg-canvas text-text border border-line",
  pending: "bg-canvas text-text-muted border border-line",
};

function Icon({ tone }: { tone: Tone }) {
  const common = { width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 2, "aria-hidden": true } as const;
  if (tone === "accent") return <svg {...common}><path d="M3 8.5l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (tone === "warning") return <svg {...common}><path d="M8 2l6.5 12h-13L8 2z" strokeLinejoin="round" /><path d="M8 7v3M8 12v.5" strokeLinecap="round" /></svg>;
  if (tone === "error") return <svg {...common}><circle cx="8" cy="8" r="6" /><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" strokeLinecap="round" /></svg>;
  // Only the ring turns, so the words beside it keep their full contrast; with reduced motion it stands still.
  if (tone === "working") {
    return (
      <svg {...common} className="text-accent motion-safe:animate-spin">
        <circle cx="8" cy="8" r="6" opacity="0.25" />
        <path d="M8 2a6 6 0 0 1 6 6" strokeLinecap="round" />
      </svg>
    );
  }
  if (tone === "pending") return <svg {...common}><circle cx="8" cy="8" r="6" /></svg>;
  return <svg {...common}><circle cx="8" cy="8" r="6" /><path d="M5 8h6" strokeLinecap="round" /></svg>;
}

/** The first question's "Question 1 of 6" line, which takes focus when "Preparing your interview" gives way to it. */
export const firstQuestionId = "interview-question-1";

/** A status chip: always an icon and words, never colour alone. */
export function Status({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${toneClasses[tone]}`}>
      <Icon tone={tone} />
      {children}
    </span>
  );
}

/** When a practice was saved, as "26 Oct 2026", in UK time so the server and the browser agree. */
export function practisedOn(at: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric" }).format(new Date(at));
}
