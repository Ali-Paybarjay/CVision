"use client";

import { useRef, useState, useTransition } from "react";
import type { TailoringChange, TailoringStatus } from "@/shared/contracts";
import { Button, cn, CvPaper, Field, FitLine, Textarea, WarningIcon } from "@/shared/ui";

/** What happened to a card's line when another change to it was approved (#465). */
export type LineNote = "replaced" | "sent-back";

const sectionNames: Record<TailoringChange["section"], string> = {
  summary: "Professional summary",
  skills: "Skills",
  experience: "Work experience",
  education: "Education",
  certifications: "Certificates",
};

/**
 * Each decision as a chip of its own colour, with a mark and words (#531): Approved on Fit, Rejected muted, and a change
 * not decided yet in the warning colour, as something to check. The count in step 3 uses the same words.
 */
const decisionWords: Record<TailoringStatus, string> = {
  approved: "✓ Approved",
  rejected: "✕ Rejected",
  proposed: "Not decided yet",
};

const decisionColours: Record<TailoringStatus, string> = {
  approved: "bg-fit text-accent",
  rejected: "border border-line text-text-muted",
  proposed: "bg-warning-bg text-warning",
};

function DecisionChip({ status }: { status: TailoringStatus }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[12.5px] font-semibold", decisionColours[status])}>
      {status === "proposed" && <WarningIcon className="size-3.5 shrink-0" />}
      {decisionWords[status]}
    </span>
  );
}

/**
 * One suggested change with its before, after and evidence, and the user's Approve, Reject and Edit. Approve and Reject
 * switch the decision, and Undo beside a decision takes the change back to not decided yet (#531).
 */
export function ChangeCard({
  change,
  onDecide,
  role,
  lineNote,
}: {
  change: TailoringChange;
  onDecide: (change: TailoringChange) => Promise<void>;
  /** For a new work line, the role it goes under, such as "Customer Assistant (part-time), Greenway Foods", and whether the answer named it (#446, #467). */
  role?: { role: string; named: boolean };
  /** After an approval to a line that already had one: on the new change, "replaced"; on the earlier one, "sent-back" (#465). */
  lineNote?: LineNote;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(change.after);
  const [pending, startTransition] = useTransition();
  // Undo takes itself away, so focus goes to the chip, which then says "Not decided yet", and the next Tab carries on
  // from this card, not from the top of the page (#531).
  const status = useRef<HTMLSpanElement>(null);

  // The decision goes to the page at once, outside the transition: React would hold it until every async transition on
  // the page ends, such as a suggestion being written, and a second decision in that time would undo the first (#465).
  const decide = (status: TailoringStatus, after = change.after) => {
    const saving = onDecide({ ...change, status, after });
    startTransition(async () => {
      await saving;
      setEditing(false);
    });
  };

  return (
    // An approved card has the Teal edge of a tailored line, so the decisions on a long list are seen at a glance (#531).
    <div className={cn("flex flex-col gap-3 rounded-md border p-4", change.status === "approved" ? "border-fit-bar" : "border-line")}>
      <p className="text-xs font-semibold tracking-wide text-text-muted uppercase">{sectionNames[change.section]}</p>

      <CvPaper as="div" className="text-sm">
        {change.before?.trim() ? (
          <>
            <p className="text-xs font-semibold text-text-muted">Before</p>
            <p className="mt-1 text-text-muted line-through">{change.before}</p>
          </>
        ) : (
          // A new line removes nothing, so nothing is struck through (#299).
          <>
            <p className="text-xs font-semibold text-text-muted">New line</p>
            <p className="mt-1 text-text-muted">{!role
                ? "This line is added to your CV. Nothing is removed."
                : role.named
                  ? `This line is added under ${role.role}. Nothing is removed.`
                  : `Your answer does not name a role on your CV, so this line is added under your latest role: ${role.role}. Nothing is removed.`}</p>
          </>
        )}
        <p className="mt-4 text-xs font-semibold text-text-muted">After</p>
        <FitLine className="mt-1">{change.after}</FitLine>
      </CvPaper>

      <p className="text-sm text-text-muted">
        <span className="font-semibold">{change.evidenceSource === "cv" ? "From your CV:" : "From what you told us:"}</span> “
        {change.evidence}”
      </p>

      {editing ? (
        <div className="flex flex-col gap-3">
          <Field label="Edit the suggested line" hint="Keep it true: only what you have actually done.">
            {(props) => <Textarea {...props} value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={600} />}
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => decide("approved", draft.trim())} disabled={pending || draft.trim() === ""}>
              Save and approve
            </Button>
            <Button variant="quiet" onClick={() => (setDraft(change.after), setEditing(false))}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {/* A decision already made looks done: its button goes quiet and cannot be pressed again. The other one changes the decision. */}
          <Button
            onClick={() => decide("approved")}
            aria-pressed={change.status === "approved"}
            disabled={pending || change.status === "approved"}
          >
            Approve
          </Button>
          <Button
            onClick={() => decide("rejected")}
            aria-pressed={change.status === "rejected"}
            disabled={pending || change.status === "rejected"}
          >
            Reject
          </Button>
          <Button variant="quiet" onClick={() => setEditing(true)} disabled={pending}>
            Edit
          </Button>
          <span ref={status} className="flex flex-wrap items-center gap-2 text-sm text-text-muted" aria-live="polite" tabIndex={-1}>
            <DecisionChip status={change.status} />
            {change.status === "proposed" && lineNote === "sent-back" && "Back with your suggestions: you approved another change to this line."}
          </span>
          {/* Quiet, beside the decision it takes back: the change is not decided again, as before Approve or Reject (#531). */}
          {change.status !== "proposed" && (
            <Button
              variant="quiet"
              onClick={() => {
                decide("proposed");
                status.current?.focus();
              }}
              disabled={pending}
              className="px-0"
            >
              Undo<span className="sr-only"> your decision</span>
            </Button>
          )}
        </div>
      )}
      {lineNote === "replaced" && change.status === "approved" && (
        <p className="text-sm text-text-muted">This replaces the change you approved earlier to the same line. That one is back with your suggestions.</p>
      )}
    </div>
  );
}
