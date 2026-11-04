"use client";

import { useId, useState, useTransition } from "react";
import { answerGap } from "@/features/tailor/actions";
import type { GapAnswer, NextStep } from "@/features/tailor/types";
import type { Gap, TailoringChange } from "@/shared/contracts";
import { Button, Notice, Textarea } from "@/shared/ui";
import { ChangeCard } from "./change-card";
import { unreachableMessage } from "./messages";

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
};

/**
 * One thing the job asks for that the CV does not show, answered in the user's own words, with one of the things they
 * may have done when the question offers any, or with a plain no.
 */
export function GapCard({ jobId, prompt, state, setState, onAnswered, earlierAnswers, changes, onDecide }: GapCardProps) {
  const [detail, setDetail] = useState("");
  const [pending, startTransition] = useTransition();
  const errorId = useId();
  const { gap, options = [] } = prompt;

  const submit = (chosen: string | null) => {
    setState({ phase: "working" });
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
        <ChangeCard key={change.id} change={change} onDecide={onDecide} />
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
          <div>
            <Button variant="quiet" onClick={() => setState({ phase: "open" })}>
              Change my answer
            </Button>
          </div>
        </>
      )}
    </article>
  );
}
