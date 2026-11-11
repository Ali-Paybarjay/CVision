"use client";

import { useState, useTransition } from "react";
import type { TailoringChange, TailoringStatus } from "@/shared/contracts";
import { Button, CvPaper, Field, FitLine, Textarea } from "@/shared/ui";

/** What happened to a card's line when another change to it was approved (#465). */
export type LineNote = "replaced" | "sent-back";

const sectionNames: Record<TailoringChange["section"], string> = {
  summary: "Professional summary",
  skills: "Skills",
  experience: "Work experience",
  education: "Education",
  certifications: "Certificates",
};

/** One suggested change with its before, after and evidence, and the user's Approve, Reject and Edit. Approve and Reject switch the decision. */
export function ChangeCard({
  change,
  onDecide,
  role,
  lineNote,
}: {
  change: TailoringChange;
  onDecide: (change: TailoringChange) => Promise<void>;
  /** For a new work line, the role it goes under, such as "Customer Assistant (part-time), Greenway Foods" (#446). */
  role?: string;
  /** After an approval to a line that already had one: on the new change, "replaced"; on the earlier one, "sent-back" (#465). */
  lineNote?: LineNote;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(change.after);
  const [pending, startTransition] = useTransition();

  // The decision goes to the page at once, outside the transition: React would hold it until every async transition on
  // the page ends, such as a suggestion being written, and a second decision in that time would undo the first (#465).
  const decide = (status: TailoringStatus, after = change.after) => {
    const saving = onDecide({ ...change, status, after });
    startTransition(async () => {
      await saving;
      setEditing(false);
    });
  };

  const statusText =
    change.status === "approved"
      ? "✓ Approved"
      : change.status === "rejected"
        ? "✕ Rejected"
        : lineNote === "sent-back"
          ? "Back with your suggestions: you approved another change to this line."
          : "Waiting for your decision";

  return (
    <div className="flex flex-col gap-3 rounded-md border border-line p-4">
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
            <p className="mt-1 text-text-muted">{role ? `This line is added under ${role}. Nothing is removed.` : "This line is added to your CV. Nothing is removed."}</p>
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
          <span className="text-sm text-text-muted" aria-live="polite">
            {statusText}
          </span>
        </div>
      )}
      {lineNote === "replaced" && change.status === "approved" && (
        <p className="text-sm text-text-muted">This replaces the change you approved earlier to the same line. That one is back with your suggestions.</p>
      )}
    </div>
  );
}
