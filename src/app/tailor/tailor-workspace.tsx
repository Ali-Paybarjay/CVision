"use client";

import { useEffect, useRef, useState } from "react";
import { decideChange } from "@/features/tailor/actions";
import { currentLetter, letterBasis, type LetterState } from "@/features/tailor/letter-state";
import { buildTailoredCv, changesOnCv, newLineRole, sameTarget } from "@/features/tailor/tailored-cv";
import type { GapAnswer, NextStep } from "@/features/tailor/types";
import type { Job, Profile, TailoringChange } from "@/shared/contracts";
import { Button, Card, cn, Notice } from "@/shared/ui";
import { ApplyPanel } from "./apply-panel";
import { ChangeCard, type LineNote } from "./change-card";
import { ChooseAnotherJob } from "./choose-another-job";
import { CoverLetterPanel } from "./cover-letter-panel";
import { CvPreview } from "./cv-preview";
import { CvSuggestions } from "./cv-suggestions";
import { DownloadBar } from "./download-bar";
import { FinalCheck } from "./final-check";
import { GapCard, type GapPrompt, type GapState } from "./gap-card";
import { decideOnLine, type LineNotes } from "./line-decision";
import { unreachableMessage } from "./messages";
import { QuestionsStep } from "./questions-step";
import { DocumentIcon, DownloadIcon, JobIcon, LetterIcon, QuestionIcon, StatusPill, StepTracker, TailorStep, type StepStatus } from "./tailor-step";

export type { GapPrompt };

/** At most this many questions one by one; the rest wait under "More ways to strengthen your CV". */
const mainQuestions = 5;

/** Under the key to the live CV's marks: both marks, as a suggestion is highlighted too (#565). */
export const legendSentence =
  "Lines with a bar on the left are the changes you approved. Dashed lines are suggestions, not in your CV until you approve them. The highlight is only on this page, not in your download.";

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
  /** A message for the whole page, such as the daily limit's, under the heading, which takes focus, so a screen reader reads it (#468). */
  notice?: string | null;
};

/** "Suggest again" brings back suggestions lost on an earlier visit; one the page already has is not shown twice. */
function withoutRepeats(suggested: TailoringChange[], current: TailoringChange[]): TailoringChange[] {
  return suggested.filter((change) => !current.some((other) => other.section === change.section && other.before === change.before && other.after === change.after));
}

/**
 * The suggested changes the live CV shows in a dashed box: each one from the user's answers not decided yet, unless an
 * approved change or an earlier suggestion already takes its line, as only one change per line can be on the CV (#272).
 * Suggestions from the CV itself wait in step 3 until approved: shown too, they made every line dashed, and the line the
 * user's answer just gave got lost among them (#559).
 */
function suggestionsToShow(changes: TailoringChange[]): TailoringChange[] {
  const shown: TailoringChange[] = [];
  for (const change of changes) {
    if (change.status !== "proposed" || !change.gapId) continue;
    const taken = changes.some((other) => other.status === "approved" && sameTarget(other, change)) || shown.some((other) => sameTarget(other, change));
    if (!taken) shown.push(change);
  }
  return shown;
}

/**
 * The Tailor workspace for one job, laid out as on the Tailor v2 canvas (artboards 1 and 2): the steps on the left, with
 * one open at a time (the job, a question for each thing the job asks for that the CV does not show, the suggested
 * changes, the cover letter, then download and Apply), and the live CV on the right, with the suggested lines dashed and
 * the approved ones on Fit. On a phone the two sides are two tabs. The download has approved changes only.
 */
export function TailorWorkspace({ job, jobUrl, label, profile, prompts, savedChanges = [], notice = null }: TailorWorkspaceProps) {
  // The page's heading takes focus once when the workspace arrives, so a screen reader says the page is ready (#419).
  // Only once: Next.js runs effects again when the user comes back to this page, and focus then stays where it was.
  const heading = useRef<HTMLHeadingElement>(null);
  const focused = useRef(false);
  useEffect(() => {
    if (focused.current) return;
    focused.current = true;
    heading.current?.focus({ preventScroll: true });
  }, []);
  const [gapStates, setGapStates] = useState<Record<string, GapState>>(() =>
    Object.fromEntries(
      savedChanges.flatMap((change) => (change.gapId ? [[change.gapId, { phase: "answered", nextSteps: [], hint: null }]] : [])),
    ),
  );
  const [changes, setChanges] = useState<TailoringChange[]>(savedChanges);
  // The latest list, for a decision made before the page has drawn the one before it (#465).
  const latest = useRef<TailoringChange[]>(savedChanges);
  const changeList = (next: (current: TailoringChange[]) => TailoringChange[]) => {
    latest.current = next(latest.current);
    setChanges(latest.current);
  };
  const [answers, setAnswers] = useState<Record<string, GapAnswer>>({});
  const [letter, setLetter] = useState<LetterState | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  // The last approval that sent an earlier change to the same line back, so both cards can say so (#465).
  const [lineNotes, setLineNotes] = useState<LineNotes>(null);
  const cv = buildTailoredCv(profile, changes, job);
  // The live CV: the approved changes, and the suggestions not decided yet in their places, each line marked as
  // suggested by the change it came from, never by its text, so a tool or a language is marked too (#565).
  const shown = suggestionsToShow(changes);
  const liveCv = buildTailoredCv(profile, changes, job, { suggestions: shown });
  const onLiveCv = changesOnCv(liveCv);
  const lineNoteOf = (change: TailoringChange): LineNote | undefined =>
    lineNotes?.approved === change.id
      ? "replaced"
      : lineNotes?.sentBack.includes(change.id)
        ? "sent-back"
        : change.status === "proposed" && changes.some((other) => other.status === "approved" && sameTarget(other, change))
          ? "taken"
          : undefined;
  // Phone only: the questions or the CV, as two tabs. On a wide screen both are side by side.
  const [view, setView] = useState<"ask" | "cv">("ask");
  // The live CV, or the ad beside it; and with the changes marked, or as the download will look.
  const [panel, setPanel] = useState<"cv" | "ad">("cv");
  const [showChanges, setShowChanges] = useState(true);
  // Phone only: the change whose "See it on your CV" opened the CV tab, for the way back to its question (#565).
  const [backTo, setBackTo] = useState<string | null>(null);
  const showOnCv = (change: TailoringChange) => {
    setView("cv");
    setPanel("cv");
    setShowChanges(true);
    setBackTo(change.id);
    // The line takes focus, so a screen reader reads it and the keyboard carries on from it.
    requestAnimationFrame(() => {
      const line = document.getElementById(`cv-line-${change.id}`);
      line?.scrollIntoView({ block: "center", behavior: "smooth" });
      line?.focus({ preventScroll: true });
    });
  };
  /** Only for a change whose line is on the live CV: otherwise the button would lead nowhere (#565). */
  const showFor = (change: TailoringChange) => (onLiveCv.has(change.id) ? () => showOnCv(change) : undefined);
  const backToQuestion = () => {
    const id = backTo;
    setView("ask");
    setBackTo(null);
    requestAnimationFrame(() => {
      const button = document.getElementById(`show-${id}`);
      button?.scrollIntoView({ block: "center" });
      button?.focus({ preventScroll: true });
    });
  };
  // Approved changes whose line is not on the CV; those that lost their line to another change are told apart (#272).
  const notFound = cv.unplaced.filter((change) => !cv.sameLine.includes(change));
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
    const replaced = latest.current.filter((change) => change.gapId === gapId && change.status !== "rejected");
    setAnswers((current) => ({ ...current, [gapId]: answer }));
    changeList((current) => [...current.filter((change) => change.gapId !== gapId), ...newChanges]);
    setGapStates((current) => ({ ...current, [gapId]: { phase: "answered", nextSteps, hint } }));
    for (const change of replaced) {
      decideChange({ ...change, status: "rejected" }, { replaced: true }).catch(() => setSaveNote(unreachableMessage));
    }
  };

  const update = async (next: TailoringChange) => {
    // Only one change per CV line: approving a second one sends the earlier one back to the suggestions (#272), and
    // Undo on it straight after approves the earlier one again (#531).
    const { changes: updated, toSave, notes } = decideOnLine(latest.current, next, lineNotes);
    changeList(() => updated);
    setLineNotes(notes);
    try {
      const results = await Promise.all(toSave.map((change) => decideChange(change)));
      setSaveNote(results.find((result) => !result.saved)?.message ?? null);
    } catch {
      setSaveNote(unreachableMessage);
    }
  };

  const gapCard = (prompt: GapPrompt, main = false, heading?: string) => (
    <GapCard
      key={prompt.gap.id}
      main={main}
      heading={heading}
      onShow={showFor}
      jobId={job.id}
      prompt={prompt}
      state={gapStates[prompt.gap.id] ?? { phase: "open" }}
      setState={(state) => setGapStates((current) => ({ ...current, [prompt.gap.id]: state }))}
      onAnswered={onAnswered}
      earlierAnswers={Object.values(answers).filter((item) => item.gapId !== prompt.gap.id)}
      changes={changes.filter((change) => change.gapId === prompt.gap.id)}
      onDecide={update}
      roleOf={(change) => newLineRole(profile, change)}
      lineNoteOf={lineNoteOf}
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
    {/* The title comes first, so the way back to the list is seen at once and a screen reader, which starts at the
        focused heading, reaches it next (#462). The page's notice stays right under it (#468). */}
    <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 ref={heading} tabIndex={-1} className="text-sm font-normal text-text-muted">
            Tailor your CV
          </h1>
          <StatusPill status={applied ? "completed" : "in-progress"} />
        </div>
        <h2 className="text-2xl leading-tight sm:text-3xl">
          {job.title} <span className="font-medium text-text-muted">· {job.company}</span>
        </h2>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <ChooseAnotherJob />
          {label && <p className="w-fit rounded-full border border-line px-2 py-0.5 text-xs text-text-muted">{label}</p>}
        </div>
      </div>
      <div className="w-full lg:w-[28rem]">
        <StepTracker
          steps={[
            { label: "Job", status: statuses[1] },
            { label: "Questions", status: statuses[2] },
            { label: "Review", status: statuses[3] },
            { label: "Letter", status: statuses[4] },
            { label: "Download", status: statuses[5] },
          ]}
          current={openStep}
          onSelect={(step) => {
            setView("ask");
            goTo(step as Step);
          }}
        />
      </div>
    </header>

    {notice && <Notice tone="info">{notice}</Notice>}

    {/* Phone only: "Ask & Improve" and "CV Preview", as on the canvas's phone artboard. */}
    <div role="group" aria-label="What to show" className="grid grid-cols-2 overflow-hidden rounded-lg border border-line bg-surface lg:hidden">
      {(
        [
          ["ask", "Ask & Improve"],
          ["cv", `CV Preview · ${counts.approved + shown.length} ${counts.approved + shown.length === 1 ? "change" : "changes"}`],
        ] as const
      ).map(([value, words]) => (
        <button
          key={value}
          type="button"
          aria-pressed={view === value}
          onClick={() => {
            setView(value);
            setBackTo(null);
          }}
          className={cn(
            "min-h-12 border-b-[3px] px-2 text-[15px]",
            view === value ? "border-accent font-semibold text-text" : "border-transparent font-medium text-text-muted",
          )}
        >
          {words}
        </button>
      ))}
    </div>

    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
    <Card className={cn("min-w-0 flex-col gap-5", view === "ask" ? "flex" : "hidden lg:flex")}>
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
            {/* The same words as the chip on each card: "Not decided yet", not "Waiting", which read as "Awaiting what?" (#531). */}
            <p className="rounded-md bg-canvas px-4 py-3 text-sm" aria-live="polite">
              <span className="font-semibold">✓ Approved: {counts.approved}</span> · ✕ Rejected: {counts.rejected} · Not decided yet: {counts.waiting}.
              Only approved changes go into your CV.
            </p>
            {fromAnswers.length > 0 && (
              <section className="flex flex-col gap-4" aria-labelledby="from-answers-heading">
                <h4 id="from-answers-heading" className="font-semibold">
                  Suggestions from your answers
                </h4>
                {fromAnswers.map((change) => (
                  <ChangeCard key={change.id} change={change} onDecide={update} role={newLineRole(profile, change)} lineNote={lineNoteOf(change)} />
                ))}
              </section>
            )}
            <CvSuggestions
              jobId={job.id}
              changes={fromCv}
              loaded={fromCv.length > 0}
              onSuggested={(suggested) => changeList((current) => [...current, ...withoutRepeats(suggested, current)])}
              onDecide={update}
              lineNoteOf={lineNoteOf}
            />
              {cv.sameLine.length > 0 && (
                <Notice tone="error" title="More than one change to the same line">
                  Only one change per line can be on your CV, so {cv.sameLine.map((change) => `“${change.after}”`).join(", ")}{" "}
                  {cv.sameLine.length === 1 ? "is" : "are"} not in it. Keep one and reject the rest.
                </Notice>
              )}
              {notFound.length > 0 && (
                <Notice tone="error" title="Some approved changes are not in your CV">
                  We could not find the CV {notFound.length === 1 ? "line this change replaces" : "lines these changes replace"}:{" "}
                  {notFound.map((change) => `“${change.before ?? change.after}”`).join(", ")}. Reject {notFound.length === 1 ? "the change" : "them"}, then
                  answer the question again for a new suggestion.
                </Notice>
              )}
              {cv.overLimit.length > 0 && (
                <Notice tone="info" title="Your CV shows six skills, four tools and four certificates at most">
                  {cv.overLimit.map((line) => `“${line}”`).join(", ")} did not fit. Reject another change to make room.
                </Notice>
              )}
              {cv.leftInProfile.length > 0 && (
                <Notice tone="info" title="Some of your skills are not on this CV">
                  To keep it short, it shows up to six main skills and four tools that fit this job best. These stay in your profile:{" "}
                  {cv.leftInProfile.join(", ")}.
                </Notice>
              )}
            <div>
              <Button variant="primary" onClick={() => goTo(4)}>Continue to cover letter</Button>
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
              {/* Coral only once the letter is approved: before that, the letter's own button is the step's one Coral (#500). */}
              <Button variant={approvedLetter?.approved ? "primary" : "quiet"} onClick={() => goTo(5)}>
                Continue to download and apply
              </Button>
            </div>
          </TailorStep>

          <TailorStep
            {...stepProps(5)}
            title="5. Download and apply"
            summary="Download PDF or Word, then apply"
            status={statuses[5]}
            icon={<DownloadIcon />}
          >
            <FinalCheck cv={cv} onReview={() => goTo(3)} />
            <DownloadBar jobId={job.id} changes={changes} letter={approvedLetter} onGoToLetter={() => goTo(4)} />
            <ApplyPanel jobId={job.id} jobUrl={jobUrl} coverLetter={approvedLetter?.approved ? approvedLetter.text : null} onApplied={() => setApplied(true)} />
          </TailorStep>
        </div>
    </Card>

    {/* The live CV, beside the questions on a wide screen, staying in view while the page scrolls. */}
    <aside
      aria-labelledby="preview-heading"
      className={cn(
        "min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-surface lg:sticky lg:top-4 lg:flex lg:max-h-[calc(100vh-2rem)]",
        view === "cv" ? "flex" : "hidden",
        // Room under the CV for the bar with "Back to the question", so it never covers the key's last line.
        backTo && "mb-20 lg:mb-0",
      )}
    >
      <h2 id="preview-heading" className="sr-only">
        Your CV for this job
      </h2>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-canvas px-4 py-3">
        <div role="group" aria-label="Show" className="flex gap-1">
          {(
            [
              ["cv", "Your CV"],
              ["ad", "The job ad"],
            ] as const
          ).map(([value, words]) => (
            <button
              key={value}
              type="button"
              aria-pressed={panel === value}
              onClick={() => setPanel(value)}
              className={cn("min-h-10 rounded-md px-3.5 text-sm", panel === value ? "bg-surface font-semibold text-text" : "font-medium text-text-muted")}
            >
              {words}
            </button>
          ))}
        </div>
        {panel === "cv" && (
          <div role="group" aria-label="How the CV looks" className="flex overflow-hidden rounded-md border border-line text-[13px]">
            {(
              [
                [true, "Show changes"],
                [false, "As it will download"],
              ] as const
            ).map(([value, words]) => (
              <button
                key={words}
                type="button"
                aria-pressed={showChanges === value}
                onClick={() => setShowChanges(value)}
                className={cn("min-h-9 px-3", showChanges === value ? "bg-text font-semibold text-surface" : "bg-surface font-medium text-text")}
              >
                {words}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Scrolls on its own on a wide screen, so it can take keyboard focus. */}
      <div tabIndex={0} aria-label={panel === "cv" ? "Your CV" : "The job ad"} className="min-h-0 flex-1 overflow-y-auto bg-canvas p-3 sm:p-4">
        {panel === "cv" ? (
          showChanges ? (
            <CvPreview cv={liveCv} marked />
          ) : (
            <CvPreview cv={cv} />
          )
        ) : (
          <div className="flex flex-col gap-3 rounded-sm border border-line bg-surface p-5 text-sm sm:p-6">
            <p className="font-semibold">
              {job.title}, {job.company}
              {job.location && ` (${job.location})`}
            </p>
            <p className="whitespace-pre-line text-text-muted">{job.description}</p>
          </div>
        )}
      </div>

      {/* Phone only, right after the CV so the next Tab reaches it, and fixed at the foot of the screen so it is in
          view wherever the line is: back to the question whose "See it on your CV" opened this tab (#565). */}
      {backTo && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-canvas px-4 py-3 lg:hidden">
          <Button onClick={backToQuestion}>← Back to the question</Button>
        </div>
      )}

      {/* Only where the marks are: "As it will download" and the ad have none (#565). */}
      {panel === "cv" && showChanges && (
        <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-line px-4 py-3 text-[13px] text-text-muted">
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="h-3.5 w-5 rounded-[3px] border-[1.5px] border-dashed border-accent bg-fit" />
            Suggested, waiting for you
          </span>
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="h-3.5 w-5 border-l-[3px] border-fit-bar bg-fit" />
            Approved for this job
          </span>
          <span className="basis-full">{legendSentence}</span>
        </div>
      )}
    </aside>
    </div>
    </>
  );
}
