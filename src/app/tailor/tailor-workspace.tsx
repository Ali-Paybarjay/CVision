"use client";

import { useState } from "react";
import { decideChange } from "@/features/tailor/actions";
import { currentLetter, letterBasis, type LetterState } from "@/features/tailor/letter-state";
import { buildTailoredCv } from "@/features/tailor/tailored-cv";
import type { GapAnswer, NextStep } from "@/features/tailor/types";
import type { Job, Profile, TailoringChange } from "@/shared/contracts";
import { Button, Card, Notice } from "@/shared/ui";
import { ApplyPanel } from "./apply-panel";
import { ChangeCard } from "./change-card";
import { CoverLetterPanel } from "./cover-letter-panel";
import { CvOverview } from "./cv-overview";
import { CvPreview } from "./cv-preview";
import { CvSuggestions } from "./cv-suggestions";
import { DownloadBar } from "./download-bar";
import { GapCard, type GapPrompt, type GapState } from "./gap-card";
import { unreachableMessage } from "./messages";
import { QuestionsStep } from "./questions-step";
import { DocumentIcon, DownloadIcon, JobIcon, LetterIcon, QuestionIcon, StatusPill, StepTracker, TailorStep, type StepStatus } from "./tailor-step";

export type { GapPrompt };

/** At most this many questions one by one; the rest wait under "More ways to strengthen your CV". */
const mainQuestions = 5;

type Step = 1 | 2 | 3 | 4 | 5;

type TailorWorkspaceProps = {
  job: Job;
  jobUrl: string | null;
  /** Says when the page shows sample data or mock answers. */
  label: string;
  profile: Profile;
  prompts: GapPrompt[];
  /** The decisions the user saved on an earlier visit. */
  savedChanges?: TailoringChange[];
};

/** "Suggest again" brings back suggestions lost on an earlier visit; one the page already has is not shown twice. */
function withoutRepeats(suggested: TailoringChange[], current: TailoringChange[]): TailoringChange[] {
  return suggested.filter((change) => !current.some((other) => other.section === change.section && other.before === change.before && other.after === change.after));
}

/**
 * The Tailor workspace for one job, as five steps with one open at a time: the job, a question for each thing
 * the job asks for that the CV does not show, the suggested changes, the cover letter, then download and Apply. The CV
 * preview in the review step shows approved changes only.
 */
export function TailorWorkspace({ job, jobUrl, label, profile, prompts, savedChanges = [] }: TailorWorkspaceProps) {
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
  const questions = ordered.slice(0, mainQuestions);
  const more = ordered.filter((prompt) => !questions.includes(prompt));

  const [openStep, setOpenStep] = useState<Step | null>(() =>
    questions.every((prompt) => gapStates[prompt.gap.id]?.phase === "answered") ? 3 : 2,
  );
  const [applied, setApplied] = useState(false);

  /** Opens a step and brings its heading to the top, because closing the step above moves everything up. */
  const goTo = (step: Step) => {
    setOpenStep(step);
    requestAnimationFrame(() => {
      document.getElementById(`step-${step}`)?.scrollIntoView({ block: "start" });
      document.getElementById(`step-${step}-toggle`)?.focus({ preventScroll: true });
    });
  };

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
      jobId={job.id}
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
  const fromAnswers = changes.filter((change) => change.gapId);

  const answeredCount = questions.filter((prompt) => gapStates[prompt.gap.id]?.phase === "answered").length;
  const statusOf = (step: Step, completed: boolean, started: boolean): StepStatus =>
    completed ? "completed" : started || openStep === step ? "in-progress" : "not-started";
  const decided = counts.approved + counts.rejected;
  const hasLetter = Boolean(approvedLetter?.text);

  const statuses: Record<Step, StepStatus> = {
    1: "completed",
    2: statusOf(2, answeredCount === questions.length, answeredCount > 0),
    3: statusOf(3, decided > 0 && counts.waiting === 0, decided > 0),
    4: statusOf(4, Boolean(approvedLetter?.approved), hasLetter),
    5: statusOf(5, applied, false),
  };

  const stepProps = (step: Step) => ({
    id: `step-${step}`,
    open: openStep === step,
    onToggle: () => (openStep === step ? setOpenStep(null) : goTo(step)),
  });

  return (
    <>
    <CvOverview
      cv={cv}
      tracker={
        <StepTracker
          steps={[
            { label: "Job", status: statuses[1] },
            { label: "Questions", status: statuses[2] },
            { label: "Review", status: statuses[3] },
            { label: "Letter", status: statuses[4] },
            { label: "Download", status: statuses[5] },
          ]}
          current={openStep}
          onSelect={(step) => goTo(step as Step)}
        />
      }
      nextQuestion={questions.find((prompt) => gapStates[prompt.gap.id]?.phase !== "answered")?.question ?? null}
      suggestion={changes.find((change) => change.status === "proposed") ?? null}
      onAnswer={() => goTo(2)}
      onReview={() => goTo(3)}
    />
    <Card className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <header className="flex flex-col gap-3 border-b border-line pb-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl">Tailor your CV</h1>
            <StatusPill status={applied ? "completed" : "in-progress"} />
          </div>
          <h2 className="text-3xl leading-tight sm:text-4xl">{job.title}</h2>
          <p className="text-text-muted">{job.company} · Job application</p>
          {label && <p className="w-fit rounded-full border border-line px-2 py-0.5 text-xs text-text-muted">{label}</p>}
        </header>

        {saveNote && <Notice tone="info">{saveNote}</Notice>}

        <div className="flex flex-col divide-y divide-line">
          <TailorStep {...stepProps(1)} title="1. Job details" summary="Job title and job description" status={statuses[1]} icon={<JobIcon />}>
            <dl className="flex flex-col gap-3 text-sm">
              <div>
                <dt className="font-semibold">Job title</dt>
                <dd className="text-text-muted">
                  {job.title}, {job.company}
                  {job.location && ` (${job.location})`}
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Job description</dt>
                <dd className="whitespace-pre-line text-text-muted">{job.description}</dd>
              </div>
            </dl>
          </TailorStep>

          <TailorStep
            {...stepProps(2)}
            title="2. Questions about your experience"
            summary="What the job asks for that your CV does not show"
            status={statuses[2]}
            icon={<QuestionIcon />}
          >
            <QuestionsStep questions={questions} more={more} gapStates={gapStates} gapCard={gapCard} onFinished={() => goTo(3)} />
          </TailorStep>

          <TailorStep
            {...stepProps(3)}
            title="3. Review your tailored CV"
            summary="Preview and approve changes"
            status={statuses[3]}
            icon={<DocumentIcon />}
          >
            <p className="rounded-md bg-canvas px-4 py-3 text-sm" aria-live="polite">
              <span className="font-semibold">✓ Approved: {counts.approved}</span> · ✕ Rejected: {counts.rejected} · Waiting: {counts.waiting}. Only
              approved changes go into your CV.
            </p>
            {fromAnswers.length > 0 && (
              <section className="flex flex-col gap-4" aria-labelledby="from-answers-heading">
                <h4 id="from-answers-heading" className="font-semibold">
                  Suggestions from your answers
                </h4>
                {fromAnswers.map((change) => (
                  <ChangeCard key={change.id} change={change} onDecide={update} />
                ))}
              </section>
            )}
            <CvSuggestions
              jobId={job.id}
              changes={fromCv}
              loaded={fromCv.length > 0}
              onSuggested={(suggested) => setChanges((current) => [...current, ...withoutRepeats(suggested, current)])}
              onDecide={update}
            />
            <aside className="flex flex-col gap-3 border-t border-line pt-5" aria-labelledby="preview-heading">
              <h4 id="preview-heading" className="font-semibold">
                Your CV for this job
              </h4>
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
            <div>
              <Button onClick={() => goTo(4)}>Continue to cover letter</Button>
            </div>
          </TailorStep>

          <TailorStep
            {...stepProps(4)}
            title="4. Cover letter"
            summary="Generate and review"
            status={statuses[4]}
            icon={<LetterIcon />}
          >
            <CoverLetterPanel jobId={job.id} profile={profile} changes={changes} answers={Object.values(answers)} letter={approvedLetter} setLetter={setLetter} />
            <div>
              <Button variant="quiet" onClick={() => goTo(5)}>
                Continue to download and apply
              </Button>
            </div>
          </TailorStep>

          <TailorStep
            {...stepProps(5)}
            title="5. Download and apply"
            summary="Download PDF or Word and visit the employer's website"
            status={statuses[5]}
            icon={<DownloadIcon />}
          >
            <DownloadBar jobId={job.id} changes={changes} letter={approvedLetter} onGoToLetter={() => goTo(4)} />
            <ApplyPanel jobId={job.id} jobUrl={jobUrl} company={job.company} onApplied={() => setApplied(true)} />
          </TailorStep>
        </div>
    </Card>
    </>
  );
}
