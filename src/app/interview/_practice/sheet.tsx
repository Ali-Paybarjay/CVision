"use client";

// The question page in design A, Paper Desk (docs/design/paper-desk/interview.html): one question at a time on a sheet
// of paper, the six questions beside it with where each one is, and "Why this question" with the lines it is written
// from. flow.tsx decides what goes in them; these only lay it out.
import { useEffect, useRef, type ReactNode } from "react";
import { answerGuide } from "@/features/interview/config";
import type { InterviewQuestion, InterviewSession } from "@/features/interview/contracts";
import { followUpQuestion, mainAnswer } from "@/features/interview/engine/session";
import { quotedCvSentence } from "@/features/interview/engine/text";
import { Card, cn } from "@/shared/ui";
import { firstQuestionId, focusIsLost, sectionLabelClass } from "./ui";

/** What each kind of question asks of the candidate, in words they would use. */
const typeLabels: Record<NonNullable<InterviewQuestion["type"]>, string> = {
  "cv-deep-dive": "From your profile",
  "core-concept": "Core concept",
  scenario: "Scenario",
  "design-tradeoff": "Design trade-off",
  "problem-solving": "Problem solving",
};

/** The skill a question tests, from the role analysis, by name. */
export function skillFor(session: InterviewSession, question: InterviewQuestion): string | null {
  return session.roleProfile?.competencies.find((competency) => competency.id === question.competencyId)?.name ?? null;
}

/** The sheet's label, "Question 3 of 6 · Scenario". */
export function questionLabel(session: InterviewSession, question: InterviewQuestion): string {
  const number = session.questions.findIndex((q) => q.id === question.id) + 1;
  const type = question.type ? ` · ${typeLabels[question.type]}` : "";
  return `Question ${number} of ${session.questions.length}${type}`;
}

const questionText = "mt-2 max-w-[36ch] text-[1.375rem] leading-snug font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-[1.625rem] lg:text-3xl";

/**
 * The question on paper: its label and the skill it tests, the question in large type, then `children` (the answer
 * box, or "The interviewer is reading your answer…"). With a follow-up, the main question and the answer already
 * given stay above it, smaller, so the follow-up reads in context.
 */
export function QuestionSheet({
  session,
  question,
  answering,
  children,
}: {
  session: InterviewSession;
  question: InterviewQuestion;
  /** Which answer the box is for; null while the interviewer reads the answer. Moves focus when it changes. */
  answering: "main" | "follow-up" | null;
  children: ReactNode;
}) {
  const skill = skillFor(session, question);
  const followUp = followUpQuestion(session, question.id);
  const answer = mainAnswer(session, question.id);
  const isFirst = session.questions[0]?.id === question.id;

  // After Submit, the button pressed is gone. Focus moves to the label of what comes next (a follow-up or the next
  // question), not to the answer box, which would open the keyboard on a phone. The first question is focused by
  // "Preparing your interview" instead (progress.tsx), and a reload leaves focus alone.
  // The label is keyed by `step`, so each step gets a new one: when the old label had focus (it was focused after
  // Submit), its focus is lost with it and the new label takes it, so a screen reader reads it again (#282).
  const label = useRef<HTMLHeadingElement>(null);
  const step = `${question.id}:${answering}`;
  const shown = useRef(step);
  useEffect(() => {
    if (shown.current === step) return;
    shown.current = step;
    if (focusIsLost()) label.current?.focus();
  }, [step]);

  const labelId = isFirst ? firstQuestionId : `sheet-${question.id}`;
  const textId = `sheet-text-${question.id}`;
  // Said by a screen reader whenever it changes, wherever focus is (#282). Not the label's words, which the label
  // itself says as it takes focus.
  const announcement =
    answering === null ? "The interviewer is reading your answer…" : answering === "follow-up" ? "Follow-up question ready" : isFirst ? "" : "Next question ready";

  return (
    <section
      aria-labelledby={labelId}
      className="rounded-sm border border-line bg-surface p-5 shadow-[0_30px_60px_-36px_rgba(15,42,71,0.3)] sm:p-8 lg:p-12"
    >
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-line pb-4">
        {/* Question 1's label takes focus when "Preparing your interview" gives way to it (#232). Focused, it reads
            the question too. */}
        <h2 key={step} ref={label} id={labelId} tabIndex={-1} aria-describedby={textId} className={sectionLabelClass}>
          {questionLabel(session, question)}
        </h2>
        {skill && (
          <p className="inline-flex items-center gap-2 rounded-md bg-fit px-2.5 py-1 text-sm font-semibold text-accent">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="4" />
            </svg>
            Tests: {skill}
          </p>
        )}
      </div>

      {followUp ? (
        <>
          <p className="mt-6 text-text-muted [overflow-wrap:anywhere]">{question.text}</p>
          {answer && <GivenAnswer text={answer} />}
          <p className={cn(sectionLabelClass, "mt-7 text-accent")}>Follow-up</p>
          <p id={textId} className={questionText}>
            {followUp}
          </p>
        </>
      ) : (
        <>
          <p id={textId} className={cn(questionText, "mt-6")}>
            {question.text}
          </p>
          {answer && <GivenAnswer text={answer} />}
        </>
      )}

      <div className="mt-8">{children}</div>

      {answering === "main" && (
        <p className="mt-7 border-t border-line pt-4 text-sm text-text-muted">
          About {answerGuide.suggestedMinutes} minutes per answer. If something is missing, the interviewer may ask one follow-up.
        </p>
      )}
    </section>
  );
}

/** The answer already sent, kept on the sheet while the interviewer reads it and under its follow-up. */
function GivenAnswer({ text }: { text: string }) {
  return (
    <div className="mt-5">
      <p className={sectionLabelClass}>Your answer</p>
      <p className="mt-2 rounded-md bg-canvas p-3 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{text}</p>
    </div>
  );
}

export type RowState =
  | { kind: "current"; status: string }
  | { kind: "scored" }
  | { kind: "scoring"; status: ReactNode }
  | { kind: "unanswered"; status: ReactNode }
  | { kind: "failed"; status: ReactNode }
  | { kind: "upcoming" };

/**
 * "Your interview": the six questions by the skill each tests, and where each one is. The marker says it without
 * colour too: a tick only once a question is scored, a turning ring while it is scored, the number otherwise.
 * `footer` holds "End here" while a question is open.
 */
export function InterviewList({
  session,
  answered,
  rowState,
  footer,
}: {
  session: InterviewSession;
  /** Questions with an answer sent and finished (with its follow-up, if one was asked). */
  answered: number;
  rowState: (question: InterviewQuestion) => RowState;
  footer?: ReactNode;
}) {
  const rows = session.questions.map((question) => ({ question, state: rowState(question) }));

  return (
    <Card aria-labelledby="interview-list-title" className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="interview-list-title" className="text-base font-bold">
          Your interview
        </h2>
        <p className="text-sm text-text-muted">
          {answered} of {session.questions.length} answered
        </p>
      </div>
      <ol className="text-sm">
        {rows.map(({ question, state }, index) => (
          <li
            key={question.id}
            aria-current={state.kind === "current" ? "step" : undefined}
            className={cn(
              "flex gap-3 py-2.5",
              state.kind === "current" ? "-mx-3 my-1 rounded-md bg-fit px-3" : "border-b border-line last:border-b-0",
            )}
          >
            <Marker state={state} number={index + 1} />
            <div className="min-w-0">
              <p className={cn("[overflow-wrap:anywhere]", state.kind === "current" && "font-bold", state.kind === "upcoming" && "text-text-muted")}>
                <span className="sr-only">Question {index + 1}: </span>
                {skillFor(session, question) ?? `Question ${index + 1}`}
              </p>
              <RowStatus state={state} />
            </div>
          </li>
        ))}
      </ol>
      {footer}
    </Card>
  );
}

function RowStatus({ state }: { state: RowState }) {
  switch (state.kind) {
    case "current":
      return <p className="mt-0.5 text-xs font-semibold text-accent">{state.status}</p>;
    case "scored":
      return <p className="mt-0.5 text-xs font-semibold text-accent">Scored</p>;
    case "scoring":
    case "unanswered":
    case "failed":
      return <div className="mt-0.5 text-xs text-text-muted">{state.status}</div>;
    default:
      return null;
  }
}

function Marker({ state, number }: { state: RowState; number: number }) {
  const ring = "inline-flex size-6 flex-none items-center justify-center rounded-full text-xs font-bold";
  if (state.kind === "scored") {
    return (
      <span aria-hidden="true" className={cn(ring, "bg-accent text-surface")}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
    );
  }
  if (state.kind === "scoring") {
    // Only the ring turns; with reduced motion it stands still.
    return (
      <span aria-hidden="true" className={cn(ring, "text-accent")}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="motion-safe:animate-spin">
          <circle cx="12" cy="12" r="10" opacity="0.25" />
          <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  if (state.kind === "failed") {
    return (
      <span aria-hidden="true" className={cn(ring, "border-[1.5px] border-error text-error")}>
        !
      </span>
    );
  }
  if (state.kind === "current") {
    return (
      <span aria-hidden="true" className={cn(ring, "bg-text text-surface")}>
        {number}
      </span>
    );
  }
  return (
    <span aria-hidden="true" className={cn(ring, "border-[1.5px] border-line text-text-muted")}>
      {number}
    </span>
  );
}

/**
 * The profile line behind a question: the line it is written from, or else the line the role analysis found for the
 * skill it tests (CandidateProfile.evidence). Both are verbatim from the profile.
 */
export function profileLineFor(session: InterviewSession, question: InterviewQuestion): string | undefined {
  if (question.rationale?.cvQuote) return question.rationale.cvQuote;
  return session.candidateProfile?.evidence.find((entry) => entry.competencyId === question.competencyId)?.cvQuote ?? undefined;
}

/**
 * Why this question: the job ad's words it is written from, and the whole sentence of the profile behind it (#252),
 * so the candidate need not leave the practice to check. Both are verbatim. The model's own "why" is left out: it is
 * written for the interviewer and can give the answer away.
 */
export function WhyThisQuestion({ session, question, cv, className }: { session: InterviewSession; question: InterviewQuestion; cv: string; className?: string }) {
  const rationale = question.rationale;
  if (!rationale) return null;
  const line = profileLineFor(session, question);
  // Null when the question already says the sentence word for word, or the profile no longer holds it.
  const cvSentence = quotedCvSentence(line, cv, question.text);

  return (
    <Card aria-labelledby={`why-${question.id}`} className={cn("space-y-3 text-sm", className)}>
      <h2 id={`why-${question.id}`} className="text-base font-bold">
        Why this question
      </h2>
      <div>
        <p className="text-text-muted">From the job ad:</p>
        <q className="mt-1 block border-l-2 border-line pl-3 [overflow-wrap:anywhere]">{rationale.jdQuote}</q>
      </div>
      {cvSentence ? (
        <div>
          <p className="text-text-muted">From your profile:</p>
          <q className="mt-1 block rounded-r-sm border-l-[3px] border-fit-bar bg-fit px-3 py-2 [overflow-wrap:anywhere]">{cvSentence}</q>
        </div>
      ) : (
        // Nothing in the profile shows this skill yet (often the stretch question).
        !line && <p className="text-text-muted">Your profile doesn&apos;t show this yet, so answer from any experience you have, including study or projects.</p>
      )}
    </Card>
  );
}
