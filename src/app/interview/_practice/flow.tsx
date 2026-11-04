"use client";

// The interview itself, shared by the main page and the lab: answer one question at a time while finished
// questions are scored in the background. The saved session drives everything: whatever it needs next is
// requested, so a reload resumes exactly where it stopped.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { answerGuide, fastFailureSeconds, limits, stallSeconds, startupRetryDelayMs } from "@/features/interview/config";
import type {
  AnswerEvaluation,
  AnswerSuggestion,
  FollowUpDecision,
  InterviewQuestion,
  InterviewReport,
  InterviewSession,
  StageUsage,
} from "@/features/interview/contracts";
import {
  addAnswer,
  applyEvaluation,
  applyFollowUpDecision,
  applyReport,
  applySuggestion,
  askQuestion,
  decisionFor,
  endEarly,
  evaluationFor,
  isQuestionFinished,
  missingSuggestionIds,
  nextStep,
  reportQuestionIds,
  suggestionFor,
  unansweredQuestionIds,
  type Provenance,
} from "@/features/interview/engine/session";
import { countWords } from "@/features/interview/engine/text";
import { ConfirmInPlace } from "./confirm";
import { failureMessage, StepError, type JobState, type PracticeEnvelope, type PracticeStore } from "./store";
import { Button, Card, Notice } from "@/shared/ui";
import { InterviewList, QuestionSheet, WhyThisQuestion, type RowState } from "./sheet";
import { Status } from "./ui";

/** Sample answers by question id, for one-click answers in mock mode. */
export type SampleAnswers = Record<string, { main: string; followUp: string | null }>;

const now = () => new Date().toISOString();

/** Asks the next question as soon as the previous one is finished. */
function advance(session: InterviewSession): InterviewSession {
  const next = nextStep(session);
  return next.step === "ask" ? askQuestion(session, next.questionId, now(), crypto.randomUUID()) : session;
}

type WithUsage = { usage?: StageUsage; provenance?: Provenance };

/** Each Start begins a new run. Job keys and results carry the run, so "Start again" discards anything still in flight. */
export function runOf(envelope: PracticeEnvelope): string {
  return String(envelope.startedAtMs);
}

/** Counts one more go at a start-up stage of this run, for interview.startup_ready (#232). */
function countStartupRetry(store: PracticeStore, run: string) {
  store.updateEnvelope((current) => (runOf(current) === run ? { ...current, startupRetries: (current.startupRetries ?? 0) + 1 } : current));
}

/** Try again on a failed start-up stage: counted, then run again by the next drive. */
export function retryStartupStage(store: PracticeStore, run: string, key: string) {
  countStartupRetry(store, run);
  store.retryJob(key);
}

/**
 * A start-up stage's request (#232). After a quick failure worth a second go (no connection, a server error, an answer
 * that broke a rule twice) it is sent once more after a short pause, while the page says "Trying again…". Only a quick
 * one, within `fastFailureSeconds` (#266): a slower failure may have left the server still working on the first
 * request, and a second would pay for the model twice. A second failure is the stage's, and so is a slow failure or a
 * request dropped after `stallSeconds` (see config): the page shows it with Try again. Try again runs the stage afresh,
 * with its own second go. `ms` is how long the go that worked took, without the failed one or the pause before the
 * second (#281), for interview.startup_ready.
 */
async function withOneRetry<T>(store: PracticeStore, run: string, key: string, request: () => Promise<T>): Promise<{ result: T; ms: number }> {
  store.noteAttempt(key);
  const startedAt = Date.now();
  try {
    return { result: await request(), ms: Date.now() - startedAt };
  } catch (error) {
    if (!(error instanceof StepError) || !error.retryable || Date.now() - startedAt > fastFailureSeconds * 1000) throw error;
    countStartupRetry(store, run);
    store.noteAttempt(key);
    // A blip (a dropped connection, an overloaded server) often lasts a few seconds: an instant resend would meet it too.
    await new Promise((resolve) => setTimeout(resolve, startupRetryDelayMs));
    const secondGoAt = Date.now();
    return { result: await request(), ms: Date.now() - secondGoAt };
  }
}

/**
 * Requests whatever the session needs next. Running or failed requests are not repeated (see runJob).
 * `context` goes into every request: the lab sends the job ad and CV, the main page only the job id.
 */
export function drive(store: PracticeStore, envelope: PracticeEnvelope, context: Record<string, unknown>) {
  const { session } = envelope;
  const run = runOf(envelope);
  const call = <T,>(body: Record<string, unknown>) => store.callStep<T>({ ...context, ...body });
  /** The three start-up stages: timed out when they stop answering, and tried once more. `body` is read for each try. */
  const callStartup = <T,>(key: string, body: () => Record<string, unknown>) =>
    withOneRetry(store, run, key, () => store.callStep<T>({ ...context, ...body() }, { timeoutMs: stallSeconds * 1000 }));
  /** Applies a result only to the session it was requested for. */
  const updateSameSession = (sessionId: string, change: (session: InterviewSession) => InterviewSession) =>
    store.updateSession((current) => (current.id === sessionId ? change(current) : current));

  if (!session) {
    const key = `${run}:analyse`;
    store.runJob(key, async () => {
      const { result, ms } = await callStartup<{ session: InterviewSession }>(key, () => ({
        step: "analyse",
        id: crypto.randomUUID(),
        startedAt: new Date(envelope.startedAtMs).toISOString(),
      }));
      store.updateEnvelope((current) =>
        current.session || runOf(current) !== run ? current : { ...current, session: result.session, stageMs: { ...current.stageMs, analyse: ms } },
      );
    });
    return;
  }

  const next = nextStep(session);
  if (next.step === "generate" || next.step === "review") {
    const step = next.step;
    const key = `${run}:${step}`;
    store.runJob(key, async () => {
      // The review request also says how long this start, and stages 1 and 2, have taken, for interview.startup_ready.
      const { result, ms } = await callStartup<{ session: InterviewSession }>(key, () => {
        if (step !== "review") return { step, session };
        const saved = store.readEnvelope();
        return {
          step,
          session,
          waitedMs: Math.max(0, Date.now() - envelope.startedAtMs),
          analyseMs: saved?.stageMs?.analyse,
          generateMs: saved?.stageMs?.generate,
          retries: saved?.startupRetries ?? 0,
        };
      });
      store.updateEnvelope((envelope) => {
        if (!envelope.session || envelope.session.id !== session.id || nextStep(envelope.session).step !== step) return envelope;
        if (step === "generate") return { ...envelope, session: result.session, stageMs: { ...envelope.stageMs, generate: ms } };
        return { ...envelope, session: advance(result.session), startupMs: Date.now() - envelope.startedAtMs };
      });
    });
  }

  if (next.step === "decide") {
    const questionId = next.questionId;
    store.runJob(`${run}:decide:${questionId}`, async () => {
      const result = await call<{ decision: FollowUpDecision } & WithUsage>({ step: "follow-up", session, questionId });
      // A decision that arrives after "End here" is dropped: the record is closed.
      updateSameSession(session.id, (current) =>
        decisionFor(current, questionId) || current.endedAt
          ? current
          : advance(applyFollowUpDecision(current, result.decision, now(), crypto.randomUUID(), result.usage, result.provenance)),
      );
    });
  }

  // Each finished question is scored on its own, in the background, while the interview carries on. After
  // "End here", only the questions with a genuine answer are scored.
  const scoredIds = new Set(reportQuestionIds(session));
  for (const question of session.questions) {
    if (!isQuestionFinished(session, question.id) || !scoredIds.has(question.id) || evaluationFor(session, question.id)) continue;
    store.runJob(`${run}:evaluate:${question.id}`, async () => {
      const result = await call<{ evaluation: AnswerEvaluation } & WithUsage>({ step: "evaluate", session, questionId: question.id });
      updateSameSession(session.id, (current) => applyEvaluation(current, result.evaluation, result.usage, result.provenance));
    });
  }

  // After "End here" (#205): one request records it, and each unanswered question gets its suggested answer.
  // The session never shows that the end was recorded, so it is sent once per tab; the server skips a repeat
  // from a reload or another tab.
  if (session.endedAt && next.step !== "done") {
    store.runJob(
      `${run}:end`,
      async () => {
        await call({ step: "end", session });
      },
      { once: true },
    );
  }
  for (const questionId of missingSuggestionIds(session)) {
    store.runJob(`${run}:suggest:${questionId}`, async () => {
      const result = await call<{ suggestion: AnswerSuggestion } & WithUsage>({ step: "suggest", session, questionId });
      updateSameSession(session.id, (current) =>
        suggestionFor(current, questionId) ? current : applySuggestion(current, result.suggestion, result.usage, result.provenance),
      );
    });
  }

  if (next.step === "report") {
    store.runJob(`${run}:report`, async () => {
      const result = await call<{ report: InterviewReport } & WithUsage>({ step: "report", session });
      updateSameSession(session.id, (current) => (current.report ? current : applyReport(current, result.report, result.usage, result.provenance)));
    });
  }
}

export function InterviewFlow({
  store,
  session,
  jobs,
  run,
  cv,
  samples,
  onDraftChange,
}: {
  store: PracticeStore;
  session: InterviewSession;
  jobs: Readonly<Record<string, JobState>>;
  run: string;
  /** The CV text the questions were written from, to show the sentence a question quotes (#252). */
  cv: string;
  /** Mock mode only. */
  samples?: SampleAnswers;
  /** Told whether the answer box holds text not yet submitted, so "Start again" can ask first (#269). */
  onDraftChange?: (hasDraft: boolean) => void;
}) {
  const step = nextStep(session);
  // While the questions are prepared, "Preparing your interview" (progress.tsx) is all there is: the list would be
  // empty, then show draft questions the review may still change (#282).
  if (step.step === "analyse" || step.step === "generate" || step.step === "review") return null;
  const scoredIds = reportQuestionIds(session);
  const scored = scoredIds.filter((id) => evaluationFor(session, id)).length;
  const unanswered = new Set(unansweredQuestionIds(session));
  const failedSuggestions = [...unanswered].map((id) => `${run}:suggest:${id}`).filter((key) => jobs[key]?.status === "failed");
  const suggestFailure = failedSuggestions.length > 0 ? jobs[failedSuggestions[0]] : undefined;
  const reportJob = jobs[`${run}:report`];
  const current = step.step === "answer" || step.step === "decide" ? session.questions.find((q) => q.id === step.questionId) : undefined;
  const answered = session.questions.filter((q) => isQuestionFinished(session, q.id) && !unanswered.has(q.id)).length;

  /** Where each question is, for "Your interview". A failed request keeps its Try again there. */
  const rowState = (question: InterviewQuestion): RowState => {
    const id = question.id;
    if (id === current?.id) {
      // The sheet says "The interviewer is reading your answer…" meanwhile, so the list does not repeat it.
      const status = step.step === "decide" ? "Answer sent" : step.step === "answer" && step.kind === "follow-up" ? "Answering the follow-up" : "Answering now";
      return { kind: "current", status };
    }
    if (unanswered.has(id)) {
      if (suggestionFor(session, id)) return { kind: "unanswered", status: "Not answered · suggested answer ready" };
      const key = `${run}:suggest:${id}`;
      const job = jobs[key];
      if (job?.status === "failed") return { kind: "failed", status: <FailedJob store={store} job={job} jobKey={key} failed="Suggested answer failed" /> };
      return { kind: "unanswered", status: "Not answered · writing a suggested answer…" };
    }
    if (!isQuestionFinished(session, id)) return { kind: "upcoming" };
    if (evaluationFor(session, id)) return { kind: "scored" };
    const key = `${run}:evaluate:${id}`;
    const job = jobs[key];
    if (job?.status === "failed") return { kind: "failed", status: <FailedJob store={store} job={job} jobKey={key} failed="Scoring failed" /> };
    return { kind: "scoring", status: "Scoring in the background…" };
  };

  let main: ReactNode = null;
  if (current && (step.step === "answer" || step.step === "decide")) {
    main = (
      <QuestionSheet session={session} question={current} answering={step.step === "answer" ? step.kind : null}>
        {step.step === "answer" ? (
          <AnswerForm
            key={`${current.id}-${step.kind}`}
            store={store}
            questionId={current.id}
            kind={step.kind}
            sample={step.kind === "main" ? samples?.[current.id]?.main : samples?.[current.id]?.followUp}
            onDraftChange={onDraftChange}
          />
        ) : (
          <DecisionStatus store={store} job={jobs[`${run}:decide:${current.id}`]} jobKey={`${run}:decide:${current.id}`} />
        )}
      </QuestionSheet>
    );
  } else if (session.endedAt) {
    main = (
      <Card>
        <h2 className="text-xl">Writing your report</h2>
        <ul className="mt-2 space-y-1 text-text-muted">
          {scoredIds.length > 0 && (
            <li>
              Scoring your answers: {scored} of {scoredIds.length}
            </li>
          )}
          <li>
            Writing suggested answers from your profile: {unanswered.size - missingSuggestionIds(session).length} of {unanswered.size} ready
          </li>
        </ul>
        {suggestFailure?.status === "failed" && (
          <div className="mt-2 space-y-2">
            <Notice tone="error">{failureMessage(suggestFailure)}</Notice>
            {!suggestFailure.final && <Button onClick={() => failedSuggestions.forEach((key) => store.retryJob(key))}>Try again</Button>}
          </div>
        )}
      </Card>
    );
  } else if (step.step === "evaluate" || step.step === "report") {
    main = (
      <Card>
        <h2 className="text-xl">Writing your report</h2>
        <p className="mt-2 text-text-muted">
          {scored} of {session.questions.length} answers scored.
          {step.step === "report" ? " Putting the report together…" : ""}
        </p>
        {reportJob?.status === "failed" && (
          <div className="mt-2 space-y-2">
            <Notice tone="error">{failureMessage(reportJob)}</Notice>
            {!reportJob.final && <Button onClick={() => store.retryJob(`${run}:report`)}>Try again</Button>}
          </div>
        )}
      </Card>
    );
  }

  // Design A: the sheet, with the questions and "Why this question" beside it from 1024px. On a phone they follow the
  // sheet, "Why this question" first, as it helps with the answer being written.
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] lg:gap-7">
      <div className="min-w-0">{main}</div>
      <div className="flex min-w-0 flex-col gap-5">
        <InterviewList
          session={session}
          answered={answered}
          rowState={rowState}
          footer={step.step === "answer" && <EndHere key={`${step.questionId}-${step.kind}-end`} store={store} session={session} />}
        />
        {current && <WhyThisQuestion session={session} question={current} cv={cv} className="max-lg:order-first" />}
      </div>
    </div>
  );
}

/** A request for one question that failed: its message, and Try again unless it would only fail the same way (#281). */
function FailedJob({ store, job, jobKey, failed }: { store: PracticeStore; job: JobState; jobKey: string; failed: string }) {
  return (
    <div className="space-y-1">
      <p className="font-semibold text-error">{failed}</p>
      {job.status === "failed" && <p className="text-error">{failureMessage(job)}</p>}
      {job.status === "failed" && !job.final && <Button onClick={() => store.retryJob(jobKey)}>Try again</Button>}
    </div>
  );
}

/**
 * "End here" (#205): a visible way out at any question (a Fit box with a secondary button, so Coral stays on "Submit
 * answer"), confirmed in place. Answered questions keep their feedback and
 * every other question gets a suggested answer built from the CV. Hidden when ending would leave nothing unanswered,
 * so the last follow-up still leads to the full report.
 */
export function EndHere({ store, session }: { store: PracticeStore; session: InterviewSession }) {
  const [confirming, setConfirming] = useState(false);
  // The question takes focus as it opens (ConfirmInPlace); after "Keep going" or Escape, focus goes back to the button.
  const trigger = useRef<HTMLButtonElement>(null);
  const cancelled = useRef(false);
  useEffect(() => {
    if (!confirming && cancelled.current) trigger.current?.focus();
  }, [confirming]);
  const cancel = () => {
    cancelled.current = true;
    setConfirming(false);
  };

  let left: number;
  try {
    left = unansweredQuestionIds(endEarly(session, now())).length;
  } catch {
    return null;
  }
  if (left === 0) return null;
  const total = session.questions.length;
  const answered = total - left;

  if (!confirming) {
    return (
      <div className="space-y-2 rounded-md bg-fit p-3">
        <p className="text-sm">Short on time? Stop now and get a suggested answer for every question you haven&apos;t answered.</p>
        <Button ref={trigger} className="bg-surface" onClick={() => setConfirming(true)}>
          End here and see suggested answers
        </Button>
      </div>
    );
  }
  const outcome =
    answered > 0
      ? `You've answered ${answered} of ${total} questions. Those get your feedback; the other ${left} get a suggested answer built from your profile.`
      : `Each of the ${total} questions gets a suggested answer built from your profile.`;
  return (
    <ConfirmInPlace question="End the practice here?" detail={`${outcome} Anything you haven't submitted won't be saved.`} onCancel={cancel}>
      <Button onClick={() => store.updateSession((current) => endEarly(current, now()))}>End practice</Button>
      <Button onClick={cancel}>Keep going</Button>
    </ConfirmInPlace>
  );
}

function DecisionStatus({ store, job, jobKey }: { store: PracticeStore; job?: JobState; jobKey: string }) {
  if (job?.status === "failed") {
    return (
      <div className="space-y-2">
        <Notice tone="error">{failureMessage(job)}</Notice>
        {!job.final && <Button onClick={() => store.retryJob(jobKey)}>Try again</Button>}
      </div>
    );
  }
  return <Status tone="working">The interviewer is reading your answer…</Status>;
}

function AnswerForm({
  store,
  questionId,
  kind,
  sample,
  onDraftChange,
}: {
  store: PracticeStore;
  questionId: string;
  kind: "main" | "follow-up";
  sample?: string | null;
  onDraftChange?: (hasDraft: boolean) => void;
}) {
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const hasDraft = text.trim() !== "";
  useEffect(() => {
    onDraftChange?.(hasDraft);
  }, [hasDraft, onDraftChange]);
  // Once the box is gone (the answer was submitted, or the practice ended), there is no draft left.
  useEffect(() => () => onDraftChange?.(false), [onDraftChange]);
  const startedAt = useRef<string | null>(null);
  const words = countWords(text);
  const markStart = () => {
    startedAt.current ??= now();
  };
  const inRange = words >= answerGuide.minWords && words <= answerGuide.maxWords;
  const tone = words === 0 ? "text-text-muted" : inRange ? "text-accent" : "text-warning";

  const submit = () => {
    try {
      const startedAtValue = startedAt.current ?? now();
      store.updateSession((session) =>
        advance(addAnswer(session, { questionId, kind, text: text.trim(), startedAt: startedAtValue, submittedAt: now(), id: crypto.randomUUID() })),
      );
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Could not save your answer.");
    }
  };

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-sm font-bold">{kind === "main" ? "Your answer" : "Your answer to the follow-up"}</span>
        <textarea
          className="mt-2 h-56 w-full resize-y rounded-[10px] border-[1.5px] border-text-muted bg-surface p-4 text-base leading-relaxed"
          maxLength={limits.answerMaxChars}
          value={text}
          onFocus={markStart}
          onChange={(event) => {
            markStart();
            setText(event.target.value);
          }}
        />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        {/* Amber outside the range, Teal inside it; it never stops Submit, as a short answer can still be right. */}
        <p className={`inline-flex items-center gap-2 text-sm font-semibold ${tone}`} aria-live="polite">
          <WordCountIcon inRange={inRange} empty={words === 0} />
          {words} {words === 1 ? "word" : "words"} · aim for {answerGuide.minWords} to {answerGuide.maxWords} words
        </p>
        <div className="flex flex-wrap gap-3">
          {sample && (
            <Button
              onClick={() => {
                markStart();
                setText(sample);
              }}
            >
              Use sample answer
            </Button>
          )}
          <Button variant="primary" onClick={submit} disabled={text.trim() === ""}>
            Submit answer
          </Button>
        </div>
      </div>
      {problem && <Notice tone="error">{problem}</Notice>}
    </div>
  );
}

/** A tick inside the range; otherwise a circled "!", so the count's state is not told by colour alone. */
function WordCountIcon({ inRange, empty }: { inRange: boolean; empty: boolean }) {
  const common = { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
  if (empty) return null;
  if (inRange) {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 3 3 5-6" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
  );
}
