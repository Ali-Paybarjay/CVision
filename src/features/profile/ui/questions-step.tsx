"use client";

import { useEffect, useRef, useState } from "react";
import type { FollowUpAnswer } from "@/shared/contracts";
import type { FollowUpQuestion } from "../follow-up";
import { Button, Card, Field, Notice, Textarea } from "@/shared/ui";
import { Steps } from "./steps";

export type QuestionsState =
  | { status: "loading" }
  | { status: "ready"; demo: boolean }
  | { status: "error"; message: string };

type QuestionsStepProps = {
  questions: FollowUpQuestion[];
  answers: FollowUpAnswer[];
  state: QuestionsState;
  /** True right after a new CV, when this is step 3 of 3. */
  showSteps: boolean;
  focusHeading: boolean;
  /** Saves an answer; resolves to a message for the user if it couldn't. */
  onAnswer: (question: FollowUpQuestion, answer: string) => Promise<string | null> | void;
  onRetry: () => void;
  onFinish: () => void;
};

export function QuestionsStep({ questions, answers, state, showSteps, focusHeading, onAnswer, onRetry, onFinish }: QuestionsStepProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const answered = questions.filter((question) => answers.some((answer) => answer.question === question.question)).length;

  useEffect(() => {
    if (focusHeading) headingRef.current?.focus();
  }, [focusHeading]);

  return (
    <section aria-labelledby="questions-heading" className="flex flex-col gap-6">
      {showSteps && <Steps current={2} />}
      <div>
        <h2 id="questions-heading" ref={headingRef} tabIndex={-1} className="text-2xl">
          Add the detail employers look for
        </h2>
        <p className="mt-2 text-text-muted">
          Your answers become evidence for your tailored CVs. We keep them exactly as you write them, and we only use
          what you tell us. Answer as many as you like.
        </p>
      </div>

      {state.status === "loading" && (
        <Card aria-busy="true">
          <p role="status">Writing questions about your profile…</p>
        </Card>
      )}

      {state.status === "error" && (
        <Notice tone="error" title="We couldn’t write your questions">
          <p>{state.message}</p>
          <Button className="mt-3" onClick={onRetry}>
            Try again
          </Button>
        </Notice>
      )}

      {state.status === "ready" && state.demo && (
        <Notice tone="info" title="Demo mode">
          These questions come from simple rules, not the AI, while CVision isn’t connected to it.
        </Notice>
      )}

      {questions.length > 0 && (
        <ol className="flex flex-col gap-4">
          {questions.map((question, index) => (
            <li key={question.id}>
              <QuestionCard
                number={index + 1}
                question={question}
                saved={answers.find((answer) => answer.question === question.question)}
                onAnswer={onAnswer}
              />
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <Button variant="primary" onClick={onFinish}>
          {answered > 0 ? "Finish" : "Skip for now"}
        </Button>
        {questions.length > 0 && (
          <p className="text-sm text-text-muted" aria-live="polite">
            {answered} of {questions.length} answered
          </p>
        )}
      </div>
    </section>
  );
}

type QuestionCardProps = {
  number: number;
  question: FollowUpQuestion;
  saved: FollowUpAnswer | undefined;
  onAnswer: (question: FollowUpQuestion, answer: string) => Promise<string | null> | void;
};

function QuestionCard({ number, question, saved, onAnswer }: QuestionCardProps) {
  const [editing, setEditing] = useState(saved === undefined);
  const [text, setText] = useState(saved?.answer ?? "");
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const headingId = `question-${question.id}`;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!text.trim()) {
      setError("Write your answer first, or leave this question for now.");
      return;
    }
    setSaving(true);
    try {
      const problem = await onAnswer(question, text);
      if (problem) {
        setError(problem);
        return;
      }
    } finally {
      setSaving(false);
    }
    setError(undefined);
    setEditing(false);
  };

  return (
    <Card as="article" aria-labelledby={headingId}>
      <p className="text-sm text-text-muted">Question {number}</p>
      <h3 id={headingId} className="mt-1 text-lg">
        {question.question}
      </h3>
      <p className="mt-1 text-sm text-text-muted">{question.reason}</p>

      {editing ? (
        <form onSubmit={(event) => void submit(event)} noValidate className="mt-4 flex flex-col gap-3">
          <Field label="Your answer" hint="In your own words. A number or a result helps." error={error}>
            {(props) => <Textarea {...props} value={text} onChange={(event) => setText(event.target.value)} className="min-h-28" />}
          </Field>
          <div>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save answer"}
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-4">
          <p className="text-sm font-semibold">Your answer</p>
          <p className="mt-1 border-l-4 border-line pl-3 whitespace-pre-line">{saved?.answer ?? text}</p>
          <Button variant="quiet" className="mt-1 -ml-5" onClick={() => setEditing(true)}>
            Change answer
          </Button>
        </div>
      )}
    </Card>
  );
}
