"use client";

import { useState, useTransition } from "react";
import { answerGap } from "@/features/tailor/actions";
import type { GapAnswer, NextStep } from "@/features/tailor/types";
import type { Gap, TailoringChange } from "@/shared/contracts";
import { Button, Card, Field, Input, Notice } from "@/shared/ui";
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
 * One thing the job asks for that the CV does not show, answered with one tap: one of the things the user may have
 * done (or yes at work, yes in study or on their own, when the question has none), or no. The detail is optional.
 */
export function GapCard({ jobId, prompt, state, setState, onAnswered, earlierAnswers, changes, onDecide }: GapCardProps) {
  const [detail, setDetail] = useState("");
  const [pending, startTransition] = useTransition();
  const { gap, options = [] } = prompt;

  const submit = (where: "work" | "study" | null, chosen?: string) => {
    setState({ phase: "working" });
    startTransition(async () => {
      try {
        const earlier = earlierAnswers.map(({ gapId, answer, hasExperience }) => ({ gapId, answer, hasExperience }));
        const hasExperience = where !== null || chosen !== undefined;
        // Words the user wrote instead of an option are the answer itself, so they are not sent twice.
        const extra = chosen === detail.trim() ? "" : detail;
        const result = await answerGap({ jobId, gapId: gap.id, answer: extra, hasExperience, where: where ?? undefined, chosen, earlierAnswers: earlier });
        if (!result.ok) return setState({ phase: "error", message: result.message });
        onAnswered({ gapId: gap.id, question: prompt.question, answer: result.answer, hasExperience }, result.changes, result.nextSteps, result.hint);
      } catch {
        setState({ phase: "error", message: unreachableMessage });
      }
    });
  };

  return (
    <Card as="article" className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-semibold tracking-wide text-text-muted uppercase">
          {gap.importance === "essential" ? "Essential" : "Desirable"} · {gap.requirement}
        </p>
        <p className="mt-2 font-semibold">{prompt.question}</p>
      </div>

      {state.phase !== "answered" && (
        <>
          <div className={options.length > 0 ? "flex flex-col items-stretch gap-3" : "flex flex-wrap gap-3"} role="group" aria-label="Your answer">
            {options.map((option) => (
              <Button key={option} onClick={() => submit(null, option)} disabled={pending} className="h-auto py-2 text-left">
                {option}
              </Button>
            ))}
            {options.length === 0 && (
              <>
                <Button onClick={() => submit("work")} disabled={pending}>
                  Yes, at work
                </Button>
                <Button onClick={() => submit("study")} disabled={pending}>
                  Yes, in study or on my own
                </Button>
              </>
            )}
            <Button variant="quiet" onClick={() => submit(null)} disabled={pending}>
              {options.length > 0 ? "No, I have not done this" : "No"}
            </Button>
          </div>
          <Field
            label={options.length > 0 ? "Add a detail, or say it in your own words (optional)" : "Add a detail if you like (optional)"}
            hint="For example where, or a number. You can leave this empty."
            error={state.phase === "error" ? state.message : undefined}
          >
            {(props) => <Input {...props} value={detail} onChange={(event) => setDetail(event.target.value)} maxLength={300} />}
          </Field>
          {options.length > 0 && detail.trim() && (
            <div>
              <Button onClick={() => submit(null, detail.trim())} disabled={pending}>
                Use my own words
              </Button>
            </div>
          )}
          {pending && (
            <p className="text-sm text-text-muted" aria-live="polite">
              Writing a suggestion…
            </p>
          )}
        </>
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
    </Card>
  );
}
