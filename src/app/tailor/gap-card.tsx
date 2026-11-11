"use client";

import { useId, useState, useTransition } from "react";
import { answerGap } from "@/features/tailor/actions";
import type { GapAnswer, NextStep } from "@/features/tailor/types";
import type { Gap, TailoringChange } from "@/shared/contracts";
import { Button, Notice, Textarea, WaitNote } from "@/shared/ui";
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
};

/**
 * One thing the job asks for that the CV does not show, answered in the user's own words, with one of the things they
 * may have done when the question offers any, or with a plain no.
 */
export function GapCard({ jobId, prompt, state, setState, onAnswered, earlierAnswers, changes, onDecide, roleOf, lineNoteOf }: GapCardProps) {
  const [detail, setDetail] = useState("");
  const [pending, startTransition] = useTransition();
  // Whether this answer waits for the model, which took about 30 seconds on the live site (6 November, #325): see waitsForModel.
  const [askingModel, setAskingModel] = useState(false);
  const errorId = useId();
  const { gap, options = [] } = prompt;

  const submit = (chosen: string | null) => {
    setState({ phase: "working" });
    setAskingModel(waitsForModel(gap.id, chosen));
    startTransition(async () => {
      try {
        const earlier = earlierAnswers.map(({ gapId, answer, hasExperience }) => ({ gapId, answer, hasExperience }));
        // Words the user wrote are the answer itself, so they are not sent twice.
        const typed = chosen === detail.trim();
        const result = await answerGap({ jobId, gapId: gap.id, answer: typed ? "" : detail, hasExperience: chosen !== null, chosen: chosen ?? undefined, typed, earlierAnswers: earlier });
        if (!result.ok) return setState({ phase: "error", message: result.message });
        onAnswered({ gapId: gap.id, question: prompt.question, answer: result.answer, hasExperience: result.hasExperience }, result.changes, result.nextSteps, result.hint);
      } catch {
        setState({ phase: "error", message: unreachableMessage });
      }
    });
  };

  return (
    <article className="flex flex-col gap-4">
      <div>
        <p className="text-lg">{prompt.question}</p>
        <p className="mt-1 text-sm text-text-muted">
          {gap.importance === "essential" ? "Essential" : "Desirable"} · {gap.requirement}
        </p>
      </div>

      {state.phase !== "answered" && (
        <div className="flex flex-col gap-3">
          <Textarea
            aria-label="Your answer"
            aria-describedby={state.phase === "error" ? errorId : undefined}
            placeholder="Your answer…"
            className="min-h-24"
            value={detail}
            onChange={(event) => setDetail(event.target.value)}
            maxLength={300}
          />
          {state.phase === "error" && (
            <p id={errorId} className="text-sm text-error">
              {state.message}
            </p>
          )}
          <button
            type="button"
            onClick={() => submit(detail.trim())}
            disabled={pending || detail.trim() === ""}
            className="min-h-11 w-full rounded-full bg-emphasis px-5 text-sm font-semibold text-on-emphasis transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Writing a suggestion…" : "Save answer"}
          </button>
          <WaitNote>{pending && askingModel && waitNote}</WaitNote>
          {options.length > 0 && (
            <div className="flex flex-col gap-2" role="group" aria-label="Or choose an answer">
              <p className="text-sm text-text-muted">Or choose the one that fits:</p>
              {options.map((option) => (
                <Button key={option} onClick={() => submit(option)} disabled={pending} className="h-auto py-2 text-left">
                  {option}
                </Button>
              ))}
            </div>
          )}
          <div>
            <Button variant="quiet" onClick={() => submit(null)} disabled={pending} className="px-0">
              No, I have not done this
            </Button>
          </div>
        </div>
      )}

      {changes.map((change) => (
        <ChangeCard key={change.id} change={change} onDecide={onDecide} role={roleOf?.(change)} lineNote={lineNoteOf?.(change)} />
      ))}

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
              <Button variant="quiet" onClick={() => setState({ phase: "open" })}>
                Change my answer
              </Button>
            </div>
          )}
        </>
      )}
    </article>
  );
}
