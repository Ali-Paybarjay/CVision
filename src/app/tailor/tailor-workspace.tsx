"use client";

import { useState } from "react";
import { decideChange } from "@/features/tailor/actions";
import { currentLetter, letterBasis, type LetterState } from "@/features/tailor/letter-state";
import { buildTailoredCv } from "@/features/tailor/tailored-cv";
import type { GapAnswer, NextStep } from "@/features/tailor/types";
import type { Profile, TailoringChange } from "@/shared/contracts";
import { Notice } from "@/shared/ui";
import { ApplyPanel } from "./apply-panel";
import { CoverLetterPanel } from "./cover-letter-panel";
import { CvPreview } from "./cv-preview";
import { CvSuggestions } from "./cv-suggestions";
import { ExportPanel } from "./export-panel";
import { GapCard, type GapPrompt, type GapState } from "./gap-card";
import { unreachableMessage } from "./messages";

export type { GapPrompt };

/** At most this many questions open at once; the rest wait under "More ways to strengthen your CV". */
const mainQuestions = 3;

type TailorWorkspaceProps = {
  jobId: string;
  jobUrl: string | null;
  company: string;
  profile: Profile;
  prompts: GapPrompt[];
  /** The decisions the user saved on an earlier visit. */
  savedChanges?: TailoringChange[];
};

/**
 * The Tailor workspace for one job: suggestions from the CV first, then a one-tap question for each thing the job
 * asks for that the CV does not show, the cover letter, download and Apply, beside the CV preview, which shows
 * approved changes only.
 */
export function TailorWorkspace({ jobId, jobUrl, company, profile, prompts, savedChanges = [] }: TailorWorkspaceProps) {
  const [gapStates, setGapStates] = useState<Record<string, GapState>>(() =>
    Object.fromEntries(
      savedChanges.flatMap((change) => (change.gapId ? [[change.gapId, { phase: "answered", nextSteps: [], hint: null }]] : [])),
    ),
  );
  const [changes, setChanges] = useState<TailoringChange[]>(savedChanges);
  const [answers, setAnswers] = useState<Record<string, GapAnswer>>({});
  const [letter, setLetter] = useState<LetterState | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const cv = buildTailoredCv(profile, changes);
  // Worked out on every render, so a letter approved before the CV changed is never used as approved.
  const approvedLetter = currentLetter(letter, letterBasis(changes, Object.values(answers)));

  const counts = {
    approved: changes.filter((change) => change.status === "approved").length,
    rejected: changes.filter((change) => change.status === "rejected").length,
    waiting: changes.filter((change) => change.status === "proposed").length,
  };

  // Essential gaps first, and only a few at once, so the page never opens with a wall of questions.
  const ordered = [...prompts].sort((a, b) => Number(b.gap.importance === "essential") - Number(a.gap.importance === "essential"));
  const shown = ordered.filter((prompt) => prompt.gap.importance === "essential").slice(0, mainQuestions);
  const more = ordered.filter((prompt) => !shown.includes(prompt));

  const onAnswered = (answer: GapAnswer, newChanges: TailoringChange[], nextSteps: NextStep[], hint: string | null) => {
    const { gapId } = answer;
    // A new answer replaces the gap's earlier suggestions, in the saved decisions too, so an old approval
    // never stays on the CV after the user says something different.
    const replaced = changes.filter((change) => change.gapId === gapId && change.status !== "rejected");
    setAnswers((current) => ({ ...current, [gapId]: answer }));
    setChanges((current) => [...current.filter((change) => change.gapId !== gapId), ...newChanges]);
    setGapStates((current) => ({ ...current, [gapId]: { phase: "answered", nextSteps, hint } }));
    for (const change of replaced) {
      decideChange({ ...change, status: "rejected" }, { replaced: true }).catch(() => setSaveNote(unreachableMessage));
    }
  };

  const update = async (next: TailoringChange) => {
    setChanges((current) => current.map((change) => (change.id === next.id ? next : change)));
    try {
      const result = await decideChange(next);
      setSaveNote(result.saved ? null : result.message);
    } catch {
      setSaveNote(unreachableMessage);
    }
  };

  const gapCard = (prompt: GapPrompt) => (
    <GapCard
      key={prompt.gap.id}
      jobId={jobId}
      prompt={prompt}
      state={gapStates[prompt.gap.id] ?? { phase: "open" }}
      setState={(state) => setGapStates((current) => ({ ...current, [prompt.gap.id]: state }))}
      onAnswered={onAnswered}
      earlierAnswers={Object.values(answers).filter((item) => item.gapId !== prompt.gap.id)}
      changes={changes.filter((change) => change.gapId === prompt.gap.id)}
      onDecide={update}
    />
  );

  const fromCv = changes.filter((change) => !change.gapId);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,32rem)]">
      <div className="flex flex-col gap-8">
        <p className="rounded-md border border-line bg-surface px-4 py-3 text-sm" aria-live="polite">
          <span className="font-semibold">✓ Approved: {counts.approved}</span> · ✕ Rejected: {counts.rejected} · Waiting:{" "}
          {counts.waiting}. Only approved changes go into your CV.
        </p>
        {saveNote && <Notice tone="info">{saveNote}</Notice>}

        <CvSuggestions
          jobId={jobId}
          changes={fromCv}
          loaded={fromCv.length > 0}
          onSuggested={(suggested) => setChanges((current) => [...current, ...suggested])}
          onDecide={update}
        />

        <section className="flex flex-col gap-4" aria-labelledby="questions-heading">
          <div>
            <h2 id="questions-heading" className="text-xl">
              What the job asks for that your CV does not show
            </h2>
            <p className="mt-1 text-sm text-text-muted">One tap each. We add only what you tell us you have done.</p>
          </div>
          {prompts.length === 0 && (
            <Notice tone="success" title="Your CV already covers this job's requirements.">
              There is nothing to ask. Check your CV on this page before you apply.
            </Notice>
          )}
          {shown.map(gapCard)}
          {more.length > 0 && (
            <details className="group flex flex-col gap-4" open={shown.length === 0}>
              <summary className="cursor-pointer font-semibold text-accent">
                More ways to strengthen your CV ({more.length})
              </summary>
              <div className="mt-4 flex flex-col gap-4">{more.map(gapCard)}</div>
            </details>
          )}
        </section>

        <CoverLetterPanel jobId={jobId} changes={changes} answers={Object.values(answers)} letter={approvedLetter} setLetter={setLetter} />

        <ExportPanel jobId={jobId} changes={changes} letter={approvedLetter} />

        <ApplyPanel jobId={jobId} jobUrl={jobUrl} company={company} />
      </div>

      <aside className="flex flex-col gap-3 lg:sticky lg:top-6 lg:self-start" aria-labelledby="preview-heading">
        <h2 id="preview-heading" className="text-xl">
          Your CV for this job
        </h2>
        <p className="text-sm text-text-muted">Highlighted lines are the changes you approved.</p>
        {cv.unplaced.length > 0 && (
          <Notice tone="error" title="Some approved changes are not in your CV">
            We could not find the line {cv.unplaced.length === 1 ? "this change replaces" : "these changes replace"}:{" "}
            {cv.unplaced.map((change) => `“${change.after}”`).join(", ")}. Reject {cv.unplaced.length === 1 ? "it" : "them"}, then
            answer the question again for a new suggestion.
          </Notice>
        )}
        <CvPreview cv={cv} />
      </aside>
    </div>
  );
}
