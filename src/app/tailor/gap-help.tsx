"use client";

import { useState } from "react";

/** The heading of the gap questions, with a "?" that explains what a gap is and why the questions are worth answering. */
export function GapHelp() {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <div className="flex items-center gap-1">
        <h2 id="questions-heading" className="text-xl">
          What the job asks for that your CV does not show
        </h2>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls="gap-help"
          aria-label="Why we ask these questions"
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-accent"
        >
          <span aria-hidden="true" className="flex size-6 items-center justify-center rounded-full border border-accent text-sm font-semibold">
            ?
          </span>
        </button>
      </div>
      <p className="mt-1 text-sm text-text-muted">One tap each. We add only what you tell us you have done.</p>
      {open && (
        <div id="gap-help" className="mt-3 flex flex-col gap-2 rounded-md border border-line bg-surface p-4 text-sm">
          <p>
            <span className="font-semibold">What is a gap?</span> Something this job asks for that your CV does not show clearly. You may well have
            the experience; your CV just does not say so yet.
          </p>
          <p>
            <span className="font-semibold">Why we ask.</span> Only you know what you have done. Your answer gives us the facts for a new line, so
            your CV can meet more of what the job asks for without anything made up.
          </p>
          <p>
            <span className="font-semibold">What happens next.</span> We turn your answer into a suggested line. You approve, edit or reject it, and
            only approved lines go on your CV. “No” is a normal answer: nothing is added, and we suggest a way to build that skill.
          </p>
        </div>
      )}
    </div>
  );
}
