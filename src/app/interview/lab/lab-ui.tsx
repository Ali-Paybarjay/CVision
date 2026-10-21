// Small building blocks for the interview lab, in the brand's role tokens. Every status has an icon and words.
import type { ReactNode } from "react";

export type Tone = "accent" | "warning" | "error" | "muted";

const toneClasses: Record<Tone, string> = {
  accent: "bg-fit text-accent",
  warning: "bg-warning-bg text-warning",
  error: "bg-surface text-error border border-error",
  muted: "bg-canvas text-text-muted border border-line",
};

function Icon({ tone }: { tone: Tone }) {
  const common = { width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 2, "aria-hidden": true } as const;
  if (tone === "accent") return <svg {...common}><path d="M3 8.5l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (tone === "warning") return <svg {...common}><path d="M8 2l6.5 12h-13L8 2z" strokeLinejoin="round" /><path d="M8 7v3M8 12v.5" strokeLinecap="round" /></svg>;
  if (tone === "error") return <svg {...common}><circle cx="8" cy="8" r="6" /><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" strokeLinecap="round" /></svg>;
  return <svg {...common}><circle cx="8" cy="8" r="6" /><path d="M5 8h6" strokeLinecap="round" /></svg>;
}

/** A status chip: always an icon and words, never colour alone. */
export function Status({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${toneClasses[tone]}`}>
      <Icon tone={tone} />
      {children}
    </span>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-lg border border-line bg-surface p-4 sm:p-5 ${className}`}>{children}</section>;
}

/** The one main (Coral) button on a screen. */
export function PrimaryButton(props: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      className="rounded-md bg-cta px-4 py-2 font-semibold text-on-cta disabled:cursor-not-allowed disabled:opacity-50"
    >
      {props.children}
    </button>
  );
}

export function SecondaryButton(props: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      className="rounded-md border border-accent px-3 py-1.5 text-sm font-semibold text-accent hover:bg-fit disabled:cursor-not-allowed disabled:opacity-50"
    >
      {props.children}
    </button>
  );
}

export function Notice({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <div className={`flex items-start gap-2 rounded-md px-3 py-2 text-sm ${toneClasses[tone]}`} role={tone === "error" ? "alert" : undefined}>
      <span className="mt-0.5">
        <Icon tone={tone} />
      </span>
      <div>{children}</div>
    </div>
  );
}
