"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { answerGap } from "@/features/tailor/actions";
import type { GapAnswer, NextStep } from "@/features/tailor/types";
import type { Gap, TailoringChange } from "@/shared/contracts";
import { Button, cn, Notice, SectionLabel, Textarea, WaitNote } from "@/shared/ui";
import { ChangeCard, type LineNote } from "./change-card";
import { unreachableMessage } from "./messages";

/** Under "Save answer" while the model works on the answer (#325, #468): a yes gets a line, a no a next step. */
export const waitNote = "Writing a suggestion from your answer. This can take up to 30 seconds.";

/**
 * Whether an answer waits for the model, so the page says so (#468). A yes asks it for a line, and a no to a gap asks it
 * for a next step, typed ("No, not yet.") or with the No button. Only the No button on a "Make it stronger" question
 * needs no model: the CV line stays as it is. Its id is checked here, as gap-questions.ts would bring server code in.
 */
export function waitsForModel(gapId: string, chosen: string | null): boolean {
  return !(chosen === null && gapId.startsWith("stronger-"));
}

export type GapPrompt = { gap: Gap; question: string; options?: string[] };

export type GapState =
  | { phase: "open" }
  | { phase: "working" }
  | { phase: "answered"; nextSteps: NextStep[]; hint: string | null }
  | { phase: "error"; message: string };

type GapCardProps = {
  jobId: string;
  prompt: GapPrompt;
  state: GapState;
  setState: (state: GapState) => void;
  onAnswered: (answer: GapAnswer, changes: TailoringChange[], nextSteps: NextStep[], hint: string | null) => void;
  earlierAnswers: GapAnswer[];
  changes: TailoringChange[];
  onDecide: (change: TailoringChange) => Promise<void>;
  /** For a new work line, the role it goes under, shown on its card (#446). */
  roleOf?: (change: TailoringChange) => { role: string; named: boolean } | undefined;
  /** What happened to a card's line when another change to it was approved (#465). */
  lineNoteOf?: (change: TailoringChange) => LineNote | undefined;
  /**
   * A question asked one at a time in step 2, whose "Save answer" is the step's one Coral button (#500). Only one shows
   * at a time; those under "More ways to strengthen your CV" are open together, so theirs stay plain.
   */
  main?: boolean;
  /** "Question 2 of 5", above a question asked one at a time. */
  heading?: string;
  /** Shows a suggested line on the live CV beside the questions; undefined for a change whose line is not on it (#565). */
  onShow?: (change: TailoringChange) => (() => void) | undefined;
};

/**
 * Why the question is asked, from the gap's kind and the CV lines code copied for it, never from the model's words,
 * so it can only say what the CV shows. A "Make it stronger" gap is one the CV already shows: it quotes the line, as
 * strongerGaps wrote it into the detail, and asks only for more (#444, #565). Its id is checked here, as
 * gap-questions.ts would bring server code in.
 */
export function whyAsking(gap: Gap): string {
  if (gap.id.startsWith("stronger-")) {
    const line = /^Already shown by: "([\s\S]*)"$/.exec(gap.detail)?.[1];
    const more = "a detail such as a number, the scale or a result would make it stronger for this job.";
    return line ? `your CV shows this in “${line}”; ${more}` : `your CV shows this; ${more}`;
  }
  if (gap.kind === "unclear") {
    const line = gap.evidence?.[0];
    // With no line to quote, nothing on the CV is said to touch on it (#565).
    return line ? `your CV says “${line}”, but not clearly enough for this job.` : "your CV doesn’t show this clearly yet.";
  }
  return "the job asks for this, and your CV doesn’t show it yet.";
}

/**
 * One thing the job asks for that the CV does not show, answered in the user's own words, with one of the things they
 * may have done when the question offers any, or with a plain no.
 */
export function GapCard({ jobId, prompt, state, setState, onAnswered, earlierAnswers, changes, onDecide, roleOf, lineNoteOf, main = false, heading, onShow }: GapCardProps) {
  const [detail, setDetail] = useState("");
  const [pending, startTransition] = useTransition();
  // Whether this answer waits for the model, which took about 30 seconds on the live site (6 November, #325): see waitsForModel.
  const [askingModel, setAskingModel] = useState(false);
  const errorId = useId();
  const optionsId = useId();
  const resultId = useId();
  const { gap, options = [] } = prompt;
  // After an answer the form goes, and the button that had focus with it: focus goes to what the answer gave, the
  // suggestion or "Change my answer", so the next Tab is Approve, not the top of the page (#565). Not on a saved answer.
  const justAnswered = useRef(false);
  useEffect(() => {
    if (state.phase !== "answered" || !justAnswered.current) return;
    justAnswered.current = false;
    document.getElementById(resultId)?.focus();
  }, [state.phase, resultId]);

  const submit = (chosen: string | null) => {
    setState({ phase: "working" });
    setAskingModel(waitsForModel(gap.id, chosen));
    startTransition(async () => {
      try {
        const earlier = earlierAnswers.map(({ gapId, answer, hasExperience }) => ({ gapId, answer, hasExperience }));
        // Words the user wrote are the answer itself, so they are not sent twice.
        const typed = chosen === detail.trim();
        const result = await answerGap({
          jobId,
          gapId: gap.id,
          answer: typed ? "" : detail,
          hasExperience: chosen !== null,
          chosen: chosen ?? undefined,
          typed,
          // The question the user saw, so a "yes" covers only what it asked (#444).
          question: prompt.question,
          earlierAnswers: earlier,
        });
        if (!result.ok) return setState({ phase: "error", message: result.message });
        justAnswered.current = true;
        onAnswered({ gapId: gap.id, question: prompt.question, answer: result.answer, hasExperience: result.hasExperience }, result.changes, result.nextSteps, result.hint);
      } catch {
        setState({ phase: "error", message: unreachableMessage });
      }
    });
  };

  const essential = gap.importance === "essential";

  return (
    <article className={cn("flex flex-col gap-5", main && "rounded-lg border border-line bg-surface p-5 sm:p-6")}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {heading && <p className="text-sm font-semibold text-accent">{heading}</p>}
          <span className={cn("rounded-md px-2.5 py-1 text-xs font-semibold", essential ? "bg-warning-bg text-warning" : "bg-canvas text-text-muted")}>
            {essential ? "Essential" : "Desirable"}
          </span>
        </div>
        <p className="text-lg leading-snug font-semibold">{prompt.question}</p>
        <p className="text-sm text-text-muted">The job says: “{gap.requirement}”</p>
        <p className="rounded-md bg-canvas px-3 py-2.5 text-sm leading-relaxed">
          <span className="font-semibold">Why we’re asking:</span> {whyAsking(gap)}
        </p>
      </div>

      {state.phase !== "answered" && (
        <div className="flex flex-col gap-4">
          {/* A tap on one of these answers at once, as before; they look like the choices on the Tailor v2 canvas. */}
          {options.length > 0 && (
            <div className="flex flex-col gap-2" role="group" aria-labelledby={optionsId}>
              <p id={optionsId} className="font-semibold">
                What did you do? <span className="font-normal text-text-muted">Tap the one that fits.</span>
              </p>
              {options.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => submit(option)}
                  disabled={pending}
                  className="flex min-h-11 w-full items-start gap-3 rounded-[10px] border border-line bg-surface px-4 py-3 text-left text-[15px] transition-colors hover:border-accent hover:bg-fit disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span aria-hidden="true" className="mt-0.5 size-4 shrink-0 rounded-full border-2 border-text-muted" />
                  {option}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-2">
            <p className="font-semibold">{options.length > 0 ? "Something else, in your words" : "Your answer, in your words"}</p>
            <Textarea
              aria-label="Your answer"
              aria-describedby={state.phase === "error" ? errorId : undefined}
              placeholder="Your answer…"
              className="min-h-24"
              value={detail}
              onChange={(event) => setDetail(event.target.value)}
              maxLength={300}
            />
          </div>
          {state.phase === "error" && (
            <p id={errorId} className="text-sm text-error">
              {state.message}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button variant={main ? "primary" : "secondary"} onClick={() => submit(detail.trim())} disabled={pending || detail.trim() === ""}>
              {pending ? "Writing a suggestion…" : "Save answer"}
            </Button>
            <button
              type="button"
              onClick={() => submit(null)}
              disabled={pending}
              className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-4 text-sm font-medium transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              No, I have not done this
            </button>
          </div>
          <WaitNote>{pending && askingModel && waitNote}</WaitNote>
        </div>
      )}

      {/* Under a line and its own label, so the suggestion reads as what the answer gave, not as the CV's Work experience
          or another part of the question (#531). */}
      {changes.length > 0 && (
        <div className="flex flex-col gap-3 border-t border-line pt-4">
          <SectionLabel id={resultId} tabIndex={-1} className="scroll-mt-24">
            {changes.length === 1 ? "Suggestion from your answer" : "Suggestions from your answer"}
          </SectionLabel>
          {changes.map((change) => (
            <ChangeCard
              key={change.id}
              change={change}
              onDecide={onDecide}
              role={roleOf?.(change)}
              lineNote={lineNoteOf?.(change)}
              onShow={onShow?.(change)}
            />
          ))}
        </div>
      )}

      {state.phase === "answered" && (
        <>
          {state.nextSteps.map((step, index) => (
            <Notice key={index} tone="info" title="Not added to your CV">
              {step.kind === "learn" ? "A way to build it: " : "Your closest real skill: "}
              {step.suggestion}
            </Notice>
          ))}
          {state.hint && <Notice tone="info">{state.hint}</Notice>}
          {/* With a suggested line, Edit and Reject on its card already change what goes in; going back to the question is only for an answer with no line. */}
          {changes.length === 0 && (
            <div>
              <Button id={resultId} variant="quiet" onClick={() => setState({ phase: "open" })}>
                Change my answer
              </Button>
            </div>
          )}
        </>
      )}
    </article>
  );
}
