"use client";

import { useState } from "react";
import type { LetterParagraph } from "@/features/tailor/letter-state";
import { Button, CvPaper, Field, Textarea } from "@/shared/ui";

type LetterParagraphCardProps = {
  paragraph: LetterParagraph;
  /** 1 for the first paragraph of the body. */
  number: number;
  total: number;
  disabled?: boolean;
  onChange: (paragraph: LetterParagraph) => void;
};

/** One paragraph of the cover letter with the user's Keep, Remove and Edit, like a change to the CV. Keep and Remove switch the decision. */
export function LetterParagraphCard({ paragraph, number, total, disabled = false, onChange }: LetterParagraphCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(paragraph.text);
  const removed = paragraph.decision === "removed";

  const statusText = paragraph.decision === "kept" ? "✓ Kept" : removed ? "✕ Removed" : "Waiting for your decision";

  return (
    <div className="flex flex-col gap-3 rounded-md border border-line p-4">
      <p className="text-xs font-semibold tracking-wide text-text-muted uppercase">
        Paragraph {number} of {total}
      </p>

      {editing ? (
        <div className="flex flex-col gap-3">
          <Field label={`Edit paragraph ${number}`} hint="Keep it true: only what you have actually done.">
            {(props) => <Textarea {...props} className="min-h-40" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} />}
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => {
                onChange({ text: draft.trim(), decision: "kept" });
                setEditing(false);
              }}
              disabled={draft.trim() === ""}
            >
              Save and keep
            </Button>
            <Button variant="quiet" onClick={() => (setDraft(paragraph.text), setEditing(false))}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <CvPaper as="div" className="text-sm leading-relaxed">
            <p className={removed ? "text-text-muted line-through" : undefined}>{paragraph.text}</p>
          </CvPaper>
          <div className="flex flex-wrap items-center gap-3">
            {/* A decision already made looks done: its button cannot be pressed again. The other one changes the decision. */}
            <Button
              onClick={() => onChange({ ...paragraph, decision: "kept" })}
              aria-pressed={paragraph.decision === "kept"}
              disabled={disabled || paragraph.decision === "kept"}
            >
              Keep
            </Button>
            <Button onClick={() => onChange({ ...paragraph, decision: "removed" })} aria-pressed={removed} disabled={disabled || removed}>
              Remove
            </Button>
            <Button variant="quiet" onClick={() => (setDraft(paragraph.text), setEditing(true))} disabled={disabled}>
              Edit
            </Button>
            <span className="text-sm text-text-muted" aria-live="polite">
              {statusText}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
