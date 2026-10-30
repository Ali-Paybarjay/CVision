"use client";

import { useState, useTransition } from "react";
import type { TailoringChange, TailoringStatus } from "@/shared/contracts";
import { Button, CvPaper, Field, FitLine, Textarea } from "@/shared/ui";

const sectionNames: Record<TailoringChange["section"], string> = {
  summary: "Professional summary",
  skills: "Skills",
  experience: "Professional skills demonstrated",
  education: "Education",
  certifications: "Certificates",
};

/** One suggested change with its before, after and evidence, and the user's Approve, Reject and Edit. */
export function ChangeCard({ change, onDecide }: { change: TailoringChange; onDecide: (change: TailoringChange) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(change.after);
  const [pending, startTransition] = useTransition();

  const decide = (status: TailoringStatus, after = change.after) =>
    startTransition(async () => {
      await onDecide({ ...change, status, after });
      setEditing(false);
    });

  const statusText =
    change.status === "approved" ? "✓ Approved" : change.status === "rejected" ? "✕ Rejected" : "Waiting for your decision";

  return (
    <div className="flex flex-col gap-3 rounded-md border border-line p-4">
      <p className="text-xs font-semibold tracking-wide text-text-muted uppercase">{sectionNames[change.section]}</p>

      <CvPaper as="div" className="text-sm">
        <p className="text-xs font-semibold text-text-muted">Before</p>
        <p className="mt-1 text-text-muted line-through">{change.before ?? "New line"}</p>
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
          <Button
            onClick={() => decide("approved")}
            aria-pressed={change.status === "approved"}
            disabled={pending}
            className="aria-pressed:bg-accent aria-pressed:text-surface"
          >
            Approve
          </Button>
          <Button
            onClick={() => decide("rejected")}
            aria-pressed={change.status === "rejected"}
            disabled={pending}
            className="aria-pressed:bg-emphasis aria-pressed:text-on-emphasis"
          >
            Reject
          </Button>
          <Button variant="quiet" onClick={() => setEditing(true)} disabled={pending}>
            Edit
          </Button>
          {change.status !== "proposed" && (
            <Button variant="quiet" onClick={() => decide("proposed")} disabled={pending}>
              Undo
            </Button>
          )}
          <span className="text-sm text-text-muted" aria-live="polite">
            {statusText}
          </span>
        </div>
      )}
    </div>
  );
}
