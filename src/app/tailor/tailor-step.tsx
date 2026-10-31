import { cn } from "@/shared/ui/cn";

export type StepStatus = "completed" | "in-progress" | "not-started";

const statusNames: Record<StepStatus, string> = {
  completed: "Completed",
  "in-progress": "In progress",
  "not-started": "Not started",
};

const statusStyles: Record<StepStatus, string> = {
  completed: "bg-fit text-accent",
  "in-progress": "bg-fit text-accent",
  "not-started": "bg-canvas text-text-muted",
};

/** The small label that says how far a step, or the whole application, has gone. */
export function StatusPill({ status }: { status: StepStatus }) {
  return <span className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-semibold", statusStyles[status])}>{statusNames[status]}</span>;
}

type StepTrackerProps = {
  steps: { label: string; status: StepStatus }[];
  /** The number of the open step, counted from 1. */
  current: number | null;
  onSelect: (step: number) => void;
};

/** The row of numbered circles above the steps: where the user is in the application, and a way to jump to any step. */
export function StepTracker({ steps, current, onSelect }: StepTrackerProps) {
  return (
    <nav aria-label="Application steps">
      <ol className="flex items-start">
        {steps.map(({ label, status }, index) => {
          const number = index + 1;
          const isCurrent = current === number;
          return (
            <li key={label} className="relative min-w-0 flex-1">
              {number < steps.length && (
                <span aria-hidden="true" className={cn("absolute top-4 left-1/2 h-0.5 w-full", status === "completed" ? "bg-accent" : "bg-line")} />
              )}
              <button
                type="button"
                onClick={() => onSelect(number)}
                aria-current={isCurrent ? "step" : undefined}
                className="relative flex min-h-11 w-full flex-col items-center gap-1 rounded-md"
              >
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full border-2 text-sm font-semibold",
                    status === "completed" ? "border-accent bg-accent text-surface" : isCurrent ? "border-accent bg-surface text-accent" : "border-line bg-surface text-text-muted",
                  )}
                >
                  {status === "completed" ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-4">
                      <path d="m6 12.5 4 4 8-9" />
                    </svg>
                  ) : (
                    number
                  )}
                </span>
                <span className={cn("max-w-full text-xs", isCurrent ? "font-semibold text-text" : "text-text-muted")}>
                  {label}
                  <span className="sr-only">, {statusNames[status]}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

type TailorStepProps = {
  id: string;
  title: string;
  summary: string;
  status: StepStatus;
  icon: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
};

/**
 * One row of the Tailor steps. A closed step stays mounted and is only hidden, so its answers, drafts and running
 * requests survive moving between steps.
 */
export function TailorStep({ id, title, summary, status, icon, open, onToggle, children }: TailorStepProps) {
  const headingId = `${id}-heading`;
  const panelId = `${id}-panel`;

  return (
    <section id={id} aria-labelledby={headingId} className={cn("scroll-mt-24", open && "rounded-lg border border-accent")}>
      <h3 id={headingId}>
        <button
          id={`${id}-toggle`}
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className={cn("flex min-h-11 w-full items-center gap-3 rounded-lg text-left", open ? "p-4" : "py-5")}
        >
          {!open && <span className="text-text-muted">{status === "completed" ? <DoneIcon /> : icon}</span>}
          <span className="flex min-w-0 grow flex-col">
            <span className="text-lg font-semibold sm:text-xl">{title}</span>
            {!open && <span className="text-sm font-normal text-text-muted">{summary}</span>}
          </span>
          <StatusPill status={status} />
        </button>
      </h3>
      <div id={panelId} hidden={!open}>
        <div className="flex flex-col gap-5 px-4 pb-5">{children}</div>
      </div>
    </section>
  );
}

function StepIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-5">
      {children}
    </svg>
  );
}

function DoneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5">
      <circle cx="12" cy="12" r="10" className="fill-accent" />
      <path d="m8 12.5 2.5 2.5L16 9.5" fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="stroke-surface" />
    </svg>
  );
}

export function JobIcon() {
  return (
    <StepIcon>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </StepIcon>
  );
}

export function QuestionIcon() {
  return (
    <StepIcon>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.7M12 17h.01" />
    </StepIcon>
  );
}

export function DocumentIcon() {
  return (
    <StepIcon>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </StepIcon>
  );
}

export function LetterIcon() {
  return (
    <StepIcon>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </StepIcon>
  );
}

export function DownloadIcon() {
  return (
    <StepIcon>
      <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14" />
    </StepIcon>
  );
}
