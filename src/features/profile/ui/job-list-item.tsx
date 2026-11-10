"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { Button } from "@/shared/ui";
import { deleteJobAction } from "../job-actions";

/** A job's row: the link alone, the question before deleting (while deleting, or after it failed), or deleted. */
export type JobRowState = { phase: "idle" } | { phase: "asking"; deleting: boolean; problem: string | null } | { phase: "deleted" };

type JobListItemProps = {
  jobId: string;
  /** The job as the list names it: "<title> at <company>". */
  name: string;
  href: string;
  /** The user applied for this job, so it stays on their dashboard and can't be deleted here (#462). */
  onDashboard: boolean;
};

const unreachable = "We couldn’t reach CVision just now. Try again in a minute.";

/**
 * One job in a list of the user's jobs, such as Tailor's "Which job is this CV for?", with a way to delete it (#462).
 * The question opens in the row, as "Delete my profile" does on Profile, with the safe choice focused first and Escape
 * as the way back. A deleted job's row says so in place, so the user sees what happened and focus has somewhere to go;
 * the next page that lists the jobs no longer has it.
 */
export function JobListItem({ jobId, name, href, onDashboard }: JobListItemProps) {
  const [state, setState] = useState<JobRowState>({ phase: "idle" });
  const deleteButton = useRef<HTMLButtonElement>(null);
  const keepButton = useRef<HTMLButtonElement>(null);
  const deletedNote = useRef<HTMLParagraphElement>(null);
  // Where focus goes once the row changes: back to Delete after "Keep it", to "Keep it" after a failure.
  const focusNext = useRef<"delete" | "keep" | null>(null);

  useEffect(() => {
    if (state.phase === "deleted") deletedNote.current?.focus();
    const target = focusNext.current === "delete" ? deleteButton : focusNext.current === "keep" ? keepButton : null;
    focusNext.current = null;
    target?.current?.focus();
  }, [state]);

  const cancel = () => {
    focusNext.current = "delete";
    setState({ phase: "idle" });
  };

  const confirm = async () => {
    setState({ phase: "asking", deleting: true, problem: null });
    let problem: string;
    try {
      const result = await deleteJobAction(jobId);
      if (result.ok) {
        setState({ phase: "deleted" });
        return;
      }
      problem = result.message;
    } catch {
      problem = unreachable;
    }
    focusNext.current = "keep";
    setState({ phase: "asking", deleting: false, problem });
  };

  return (
    <JobRow
      name={name}
      href={href}
      onDashboard={onDashboard}
      state={state}
      onAsk={() => setState({ phase: "asking", deleting: false, problem: null })}
      onCancel={cancel}
      onConfirm={() => void confirm()}
      refs={{ deleteButton, keepButton, deletedNote }}
    />
  );
}

/** The row as it looks in each state, kept apart from the state so every state can be checked on its own. */
export function JobRow({
  name,
  href,
  onDashboard,
  state,
  onAsk,
  onCancel,
  onConfirm,
  refs,
}: Omit<JobListItemProps, "jobId"> & {
  state: JobRowState;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  refs?: {
    deleteButton: RefObject<HTMLButtonElement | null>;
    keepButton: RefObject<HTMLButtonElement | null>;
    deletedNote: RefObject<HTMLParagraphElement | null>;
  };
}) {
  const questionId = useId();
  const detailId = useId();

  if (state.phase === "deleted") {
    return (
      <li>
        <p ref={refs?.deletedNote} role="status" tabIndex={-1} className="text-text-muted">
          Deleted: {name}
        </p>
      </li>
    );
  }

  const deleting = state.phase === "asking" && state.deleting;
  return (
    <li className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-4">
        <Link href={href} className="text-accent underline underline-offset-4">
          {name}
        </Link>
        {onDashboard ? (
          <span className="ml-auto text-sm text-text-muted">On your dashboard</span>
        ) : (
          state.phase === "idle" && (
            <Button ref={refs?.deleteButton} variant="quiet" size="compact" onClick={onAsk} className="ml-auto">
              Delete<span className="sr-only"> {name}</span>
            </Button>
          )
        )}
      </div>
      {state.phase === "asking" && (
        <div
          role="alertdialog"
          aria-labelledby={questionId}
          aria-describedby={detailId}
          onKeyDown={(event) => {
            if (event.key !== "Escape" || deleting) return;
            event.preventDefault();
            onCancel();
          }}
          className="rounded-md border border-error p-4"
        >
          <p id={questionId} className="font-semibold">
            Delete this job?
          </p>
          <p className="mt-1 text-sm [overflow-wrap:anywhere]">{name}</p>
          <p id={detailId} className="mt-1 text-sm text-text-muted">
            Its match, your CV changes for it and any interview practice go too. This can’t be undone.
          </p>
          {state.problem && (
            <p role="alert" className="mt-2 text-sm text-error">
              {state.problem}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onConfirm}
              disabled={deleting}
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-error px-5 text-sm font-semibold text-error hover:bg-canvas disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete job"}
            </button>
            {/* The safe choice gets focus first. */}
            <Button ref={refs?.keepButton} variant="quiet" onClick={onCancel} autoFocus disabled={deleting}>
              Keep it
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
