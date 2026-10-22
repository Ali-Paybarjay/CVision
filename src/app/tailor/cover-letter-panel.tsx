"use client";

import { useTransition } from "react";
import { createCoverLetter } from "@/features/tailor/actions";
import { findBrandProblems } from "@/features/tailor/brand-check";
import type { GapAnswer } from "@/features/tailor/types";
import type { TailoringChange } from "@/shared/contracts";
import { Button, Card, CvPaper, Field, Notice, Textarea } from "@/shared/ui";

/** The cover letter as the user last left it; only an approved letter is used for export. */
export type LetterState = { text: string; approved: boolean; error?: string };

type CoverLetterPanelProps = {
  jobId: string;
  changes: TailoringChange[];
  answers: GapAnswer[];
  letter: LetterState | null;
  setLetter: (letter: LetterState | null) => void;
};

/** Write, edit and approve the cover letter for this job. */
export function CoverLetterPanel({ jobId, changes, answers, letter, setLetter }: CoverLetterPanelProps) {
  const [pending, startTransition] = useTransition();
  const approvedCount = changes.filter((change) => change.status === "approved").length;
  const problems = letter ? findBrandProblems(letter.text) : [];

  const write = () =>
    startTransition(async () => {
      const result = await createCoverLetter({ jobId, changes, answers });
      setLetter(result.ok ? { text: result.text, approved: false } : { text: letter?.text ?? "", approved: false, error: result.message });
    });

  return (
    <Card as="section" aria-labelledby="letter-heading" className="flex flex-col gap-4">
      <div>
        <h2 id="letter-heading" className="text-xl">
          Cover letter
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          Written only from your CV, the {approvedCount} {approvedCount === 1 ? "change" : "changes"} you approved and your own answers.
          Read it, change anything, then approve it.
        </p>
      </div>

      {letter?.error && <Notice tone="error">{letter.error}</Notice>}

      {letter && letter.text && !letter.approved && (
        <Field label="Your cover letter" hint="Edit it freely. Keep it true: only what you have actually done.">
          {(props) => (
            <Textarea
              {...props}
              className="min-h-96"
              value={letter.text}
              onChange={(event) => setLetter({ text: event.target.value, approved: false })}
            />
          )}
        </Field>
      )}

      {letter?.approved && (
        <CvPaper as="div" aria-label="Your approved cover letter" className="text-sm leading-relaxed whitespace-pre-line">
          {letter.text}
        </CvPaper>
      )}

      {problems.length > 0 && (
        <Notice tone="warning" title="Check these words">
          <ul className="list-disc pl-5">
            {problems.map((problem, index) => (
              <li key={index}>
                “{problem.found}”{problem.suggestion ? `: write “${problem.suggestion}”` : ": rewrite this, it is not in our voice"}
              </li>
            ))}
          </ul>
        </Notice>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {!letter?.approved && (
          <Button onClick={write} disabled={pending}>
            {pending ? "Writing your letter…" : letter?.text ? "Write it again" : "Write my cover letter"}
          </Button>
        )}
        {letter?.text && !letter.approved && (
          <Button
            onClick={() => setLetter({ text: letter.text.trim(), approved: true })}
            disabled={pending || letter.text.trim() === ""}
          >
            Approve cover letter
          </Button>
        )}
        {letter?.approved && (
          <>
            <span className="text-sm font-semibold text-accent">✓ Approved</span>
            <Button variant="quiet" onClick={() => setLetter({ text: letter.text, approved: false })}>
              Edit
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
