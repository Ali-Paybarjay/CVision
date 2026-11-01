"use client";

import { useState } from "react";
import { Button, Notice } from "@/shared/ui";
import type { GapPrompt, GapState } from "./gap-card";
import { GapHelp } from "./gap-help";

type QuestionsStepProps = {
  /** The questions asked one at a time. */
  questions: GapPrompt[];
  /** The rest, offered together under "More ways to strengthen your CV". */
  more: GapPrompt[];
  gapStates: Record<string, GapState>;
  gapCard: (prompt: GapPrompt) => React.ReactNode;
  onFinished: () => void;
};

/** The gap questions one at a time, with how many are answered, so the page never opens with a wall of questions. */
export function QuestionsStep({ questions, more, gapStates, gapCard, onFinished }: QuestionsStepProps) {
  const isAnswered = (prompt: GapPrompt) => gapStates[prompt.gap.id]?.phase === "answered";
  const [current, setCurrent] = useState(() => Math.max(questions.findIndex((prompt) => !isAnswered(prompt)), 0));
  const answered = questions.filter(isAnswered).length;
  const isLast = current === questions.length - 1;

  if (questions.length === 0) {
    return (
      <Notice tone="success" title="Your CV already covers this job's requirements.">
        There is nothing to ask. Check your CV on this page before you apply.
      </Notice>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <GapHelp>
          {answered} of {questions.length} {questions.length === 1 ? "question" : "questions"} answered
        </GapHelp>
        <div
          role="progressbar"
          aria-label="Questions answered"
          aria-valuemin={0}
          aria-valuemax={questions.length}
          aria-valuenow={answered}
          className="h-2 overflow-hidden rounded-full bg-line"
        >
          <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${(answered / questions.length) * 100}%` }} />
        </div>
      </div>

      {questions.map((prompt, index) => (
        <div key={prompt.gap.id} hidden={index !== current}>
          <p className="mb-1 text-lg font-semibold">Question {index + 1}</p>
          {gapCard(prompt)}
        </div>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="quiet" onClick={() => setCurrent(current - 1)} disabled={current === 0} className="px-0">
          Previous question
        </Button>
        <Button variant="quiet" onClick={() => (isLast ? onFinished() : setCurrent(current + 1))} className="px-0">
          {isLast ? "Review your tailored CV" : isAnswered(questions[current]) ? "Next question" : "Skip for now"}
        </Button>
      </div>

      {more.length > 0 && (
        <details className="border-t border-line pt-4">
          <summary className="cursor-pointer font-semibold text-accent">More ways to strengthen your CV ({more.length})</summary>
          <div className="mt-4 flex flex-col gap-4">
            {more.map((prompt) => (
              <div key={prompt.gap.id} className="rounded-md border border-line p-4">
                {gapCard(prompt)}
              </div>
            ))}
          </div>
        </details>
      )}
    </>
  );
}
