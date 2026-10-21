"use client";

import { useState } from "react";
import type { TailoringChange, TailoringStatus } from "@/shared/contracts";
import { Button, CvPaper, FitLine } from "@/shared/ui";

const sectionNames: Record<TailoringChange["section"], string> = {
  summary: "Summary",
  skills: "Skills",
  experience: "Experience",
  education: "Education",
  certifications: "Certifications",
};

/** Each suggested change with its before, after and evidence. Nothing is applied until the user approves it. */
export function ChangeReview({ changes }: { changes: TailoringChange[] }) {
  const [statuses, setStatuses] = useState<Record<string, TailoringStatus>>(() =>
    Object.fromEntries(changes.map((change) => [change.id, change.status])),
  );
  const approved = changes.filter((change) => statuses[change.id] === "approved").length;

  return (
    <div>
      <p className="text-sm text-text-muted" aria-live="polite">
        {approved} of {changes.length} changes approved. Only approved changes go into your CV.
      </p>
      <ol className="mt-4 space-y-4">
        {changes.map((change) => {
          const status = statuses[change.id];
          const setStatus = (next: TailoringStatus) => setStatuses((current) => ({ ...current, [change.id]: next }));
          return (
            <li key={change.id} className="rounded-lg border border-line bg-surface p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{sectionNames[change.section]}</p>

              <CvPaper as="div" className="mt-3">
                <p className="text-xs font-semibold text-text-muted">Before</p>
                <p className="mt-1 text-text-muted line-through">{change.before ?? <em>New line</em>}</p>
                <p className="mt-4 text-xs font-semibold text-text-muted">After</p>
                <FitLine className="mt-1">{change.after}</FitLine>
              </CvPaper>

              <p className="mt-3 text-sm text-text-muted">
                <span className="font-semibold">From {change.evidenceSource === "cv" ? "your CV" : "your answer"}:</span> “
                {change.evidence}”
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button
                  onClick={() => setStatus("approved")}
                  aria-pressed={status === "approved"}
                  className="aria-pressed:bg-accent aria-pressed:text-surface"
                >
                  Approve
                </Button>
                <Button
                  onClick={() => setStatus("rejected")}
                  aria-pressed={status === "rejected"}
                  className="aria-pressed:bg-emphasis aria-pressed:text-on-emphasis"
                >
                  Reject
                </Button>
                {status !== "proposed" && (
                  <Button variant="quiet" onClick={() => setStatus("proposed")}>
                    Undo
                  </Button>
                )}
                <span className="text-sm text-text-muted">
                  {status === "approved" ? "✓ Approved" : status === "rejected" ? "✕ Rejected" : "Waiting for your decision"}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
