"use client";

import { useState } from "react";
import type { TailoringChange, TailoringStatus } from "@/shared/contracts";

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

              {/* The CV preview stays on Paper with Ink text in both modes, as the download looks. */}
              <div className="mt-3 rounded border border-line bg-cv-paper p-4 text-cv-ink">
                <p className="text-xs font-semibold text-cv-ink/70">Before</p>
                <p className="mt-1">{change.before ?? <em>New line</em>}</p>
                <p className="mt-4 text-xs font-semibold text-cv-ink/70">After</p>
                <p className="mt-1 border-l-4 border-fit-bar bg-fit py-1 pl-3">{change.after}</p>
              </div>

              <p className="mt-3 text-sm text-text-muted">
                <span className="font-semibold">From {change.evidenceSource === "cv" ? "your CV" : "your answer"}:</span> “
                {change.evidence}”
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setStatus("approved")}
                  aria-pressed={status === "approved"}
                  className="rounded-md border border-accent px-4 py-2 text-sm font-semibold text-accent aria-pressed:bg-accent aria-pressed:text-surface"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => setStatus("rejected")}
                  aria-pressed={status === "rejected"}
                  className="rounded-md border border-line px-4 py-2 text-sm font-semibold text-text aria-pressed:bg-emphasis aria-pressed:text-on-emphasis"
                >
                  Reject
                </button>
                {status !== "proposed" && (
                  <button type="button" onClick={() => setStatus("proposed")} className="text-sm text-accent underline">
                    Undo
                  </button>
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
