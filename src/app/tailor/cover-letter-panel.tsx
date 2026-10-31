"use client";

import { useTransition } from "react";
import { createCoverLetter } from "@/features/tailor/actions";
import { findBrandProblems } from "@/features/tailor/brand-check";
import { letterBasis, letterHead, type LetterHead, type LetterState } from "@/features/tailor/letter-state";
import type { GapAnswer } from "@/features/tailor/types";
import type { Profile, TailoringChange } from "@/shared/contracts";
import { Button, CvPaper, Field, Notice, Textarea } from "@/shared/ui";
import { unreachableMessage } from "./messages";

export type { LetterState };

type CoverLetterPanelProps = {
  jobId: string;
  profile: Profile;
  changes: TailoringChange[];
  answers: GapAnswer[];
  letter: LetterState | null;
  setLetter: (letter: LetterState | null) => void;
};

/** The top of the letter as the template lays it out; added to the file too, so the user does not edit it here. */
function LetterHeading({ head }: { head: LetterHead }) {
  return (
    <div className="mb-4">
      <p className="text-center text-base font-bold">{head.fullName}</p>
      {head.contact.map((line) => (
        <p key={line} className="text-center">
          {line}
        </p>
      ))}
      <p className="mt-2 text-right">{head.date}</p>
    </div>
  );
}

/** Write, edit and approve the cover letter for this job. */
export function CoverLetterPanel({ jobId, profile, changes, answers, letter, setLetter }: CoverLetterPanelProps) {
  const [pending, startTransition] = useTransition();
  const approvedCount = changes.filter((change) => change.status === "approved").length;
  const problems = letter ? findBrandProblems(letter.text) : [];
  const basis = letterBasis(changes, answers);
  const head = letter?.text ? letterHead(profile, new Date()) : null;

  const write = () =>
    startTransition(async () => {
      try {
        const result = await createCoverLetter({ jobId, changes, answers });
        setLetter(result.ok ? { text: result.text, approved: false } : { text: letter?.text ?? "", approved: false, error: result.message });
      } catch {
        setLetter({ text: letter?.text ?? "", approved: false, error: unreachableMessage });
      }
    });

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-muted">
        Written only from your CV, the {approvedCount} {approvedCount === 1 ? "change" : "changes"} you approved and your own answers.
        Read it, change anything, then approve it.
      </p>

      {letter?.error && <Notice tone="error">{letter.error}</Notice>}
      {letter?.stale && (
        <Notice tone="warning">Your CV has changed since you approved this letter. Read it again, then approve it.</Notice>
      )}

      {head && !letter?.approved && (
        <CvPaper as="div" aria-label="The top of your letter" className="pb-0 text-sm sm:pb-0">
          <LetterHeading head={head} />
        </CvPaper>
      )}

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
        <CvPaper as="div" aria-label="Your approved cover letter" className="text-sm leading-relaxed">
          {head && <LetterHeading head={head} />}
          <div className="whitespace-pre-line">{letter.text}</div>
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
            onClick={() => setLetter({ text: letter.text.trim(), approved: true, basis })}
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
    </div>
  );
}
