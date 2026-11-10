"use client";

import { useTransition } from "react";
import { createCoverLetter } from "@/features/tailor/actions";
import { findBrandProblems } from "@/features/tailor/brand-check";
import {
  bodyWordCount,
  canApprove,
  joinLetter,
  letterBasis,
  letterHead,
  splitLetter,
  type LetterDraft,
  type LetterHead,
  type LetterState,
} from "@/features/tailor/letter-state";
import { approvedOnly, type GapAnswer } from "@/features/tailor/types";
import type { Profile, TailoringChange } from "@/shared/contracts";
import { Button, CvPaper, Notice } from "@/shared/ui";
import { LetterParagraphCard } from "./letter-paragraph-card";
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

/** Write the cover letter for this job, keep, remove or edit each paragraph, then approve it. */
export function CoverLetterPanel({ jobId, profile, changes, answers, letter, setLetter }: CoverLetterPanelProps) {
  const [pending, startTransition] = useTransition();
  const approvedCount = changes.filter((change) => change.status === "approved").length;
  const problems = letter ? findBrandProblems(letter.text) : [];
  const basis = letterBasis(changes, answers);
  const head = letter?.text ? letterHead(profile, new Date()) : null;
  // A letter from before paragraphs had decisions is taken as kept, as the user saw all of it.
  const draft = letter?.draft ?? (letter?.text ? splitLetter(letter.text, "kept") : null);
  const pendingCount = draft?.paragraphs.filter((paragraph) => paragraph.decision === "pending").length ?? 0;

  const update = (next: LetterDraft) => setLetter({ text: joinLetter(next), approved: false, draft: next });

  const write = () =>
    startTransition(async () => {
      try {
        // Only the approved changes, as the letter uses nothing else.
        const result = await createCoverLetter({ jobId, changes: approvedOnly(changes), answers });
        setLetter(
          result.ok
            ? { text: result.text, approved: false, draft: splitLetter(result.text) }
            : { text: letter?.text ?? "", approved: false, draft: letter?.draft, error: result.message },
        );
      } catch {
        setLetter({ text: letter?.text ?? "", approved: false, draft: letter?.draft, error: unreachableMessage });
      }
    });

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-muted">
        Written only from your CV, the {approvedCount} {approvedCount === 1 ? "change" : "changes"} you approved and your own answers.
        Keep, remove or edit each paragraph, then approve the letter.
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

      {draft && letter?.text && !letter.approved && (
        <div className="flex flex-col gap-3">
          {draft.greeting && <p className="text-sm text-text-muted">{draft.greeting}</p>}
          {draft.paragraphs.map((paragraph, index) => (
            <LetterParagraphCard
              // A new draft brings new paragraphs, so each card starts again from its own text.
              key={`${index}:${paragraph.text}`}
              paragraph={paragraph}
              number={index + 1}
              total={draft.paragraphs.length}
              disabled={pending}
              onChange={(next) => update({ ...draft, paragraphs: draft.paragraphs.map((item, at) => (at === index ? next : item)) })}
            />
          ))}
          <p className="text-sm text-text-muted" aria-live="polite">
            Your letter now: {bodyWordCount(draft)} words.
          </p>
        </div>
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
            onClick={() => draft && setLetter({ text: joinLetter(draft), approved: true, basis, draft })}
            disabled={pending || !draft || !canApprove(draft)}
          >
            Approve cover letter
          </Button>
        )}
        {letter?.text && !letter.approved && draft && !canApprove(draft) && (
          <span className="text-sm text-text-muted">
            {pendingCount > 0
              ? `Keep or remove ${pendingCount === 1 ? "the last paragraph" : `the other ${pendingCount} paragraphs`} to approve the letter.`
              : "Keep at least one paragraph to approve the letter."}
          </span>
        )}
        {letter?.approved && (
          <>
            <span className="text-sm font-semibold text-accent">✓ Approved</span>
            <Button variant="quiet" onClick={() => setLetter({ text: letter.text, approved: false, draft: draft ?? undefined })}>
              Edit
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
