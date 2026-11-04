"use client";

// A question asked in place before work is lost ("End here", "Start again"): no dialog, so it never covers the practice.
import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * A named group that takes focus as it opens (#281), so a screen reader hears the question and what goes with it, not
 * the question alone. Escape is the same as `onCancel`, the way back. The buttons say what they do on their own, as a
 * screen reader's list of buttons reads them without the question.
 */
export function ConfirmInPlace({
  question,
  detail,
  onCancel,
  children,
}: {
  question: string;
  /** What is lost or what happens next, read with the question. */
  detail?: ReactNode;
  onCancel: () => void;
  /** The buttons. */
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const questionId = useId();
  const detailId = useId();
  useEffect(() => {
    box.current?.focus();
  }, []);

  return (
    <div
      ref={box}
      role="group"
      tabIndex={-1}
      aria-labelledby={questionId}
      aria-describedby={detail ? detailId : undefined}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        onCancel();
      }}
      className="space-y-2 rounded-md border border-line bg-canvas p-3"
    >
      <p id={questionId} className="font-semibold">
        {question}
      </p>
      {detail && (
        <p id={detailId} className="text-sm">
          {detail}
        </p>
      )}
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
