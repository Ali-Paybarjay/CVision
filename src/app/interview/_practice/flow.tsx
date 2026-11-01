"use client";

// The interview itself, shared by the main page and the lab: answer one question at a time while finished
// questions are scored in the background. The saved session drives everything: whatever it needs next is
// requested, so a reload resumes exactly where it stopped.
import { useEffect, useRef, useState } from "react";
import { answerGuide, limits } from "@/features/interview/config";
import type { AnswerEvaluation, AnswerSuggestion, FollowUpDecision, InterviewReport, InterviewSession, StageUsage } from "@/features/interview/contracts";
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
  turnsFor,
  unansweredQuestionIds,
  type Provenance,
} from "@/features/interview/engine/session";
import { countWords } from "@/features/interview/engine/text";
import type { JobState, PracticeEnvelope, PracticeStore } from "./store";
import { Button, Card, Notice } from "@/shared/ui";
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

/**
 * Requests whatever the session needs next. Running or failed requests are not repeated (see runJob).
 * `context` goes into every request: the lab sends the job ad and CV, the main page only the job id.
 */
export function drive(store: PracticeStore, envelope: PracticeEnvelope, context: Record<string, unknown>) {
  const { session } = envelope;
  const run = runOf(envelope);
  const call = <T,>(body: Record<string, unknown>) => store.callStep<T>({ ...context, ...body });
  /** Applies a result only to the session it was requested for. */
  const updateSameSession = (sessionId: string, change: (session: InterviewSession) => InterviewSession) =>
    store.updateSession((current) => (current.id === sessionId ? change(current) : current));

  if (!session) {
    store.runJob(`${run}:analyse`, async () => {
      const result = await call<{ session: InterviewSession }>({
        step: "analyse",
        id: crypto.randomUUID(),
        startedAt: new Date(envelope.startedAtMs).toISOString(),
      });
      store.updateEnvelope((current) => (current.session || runOf(current) !== run ? current : { ...current, session: result.session }));
    });
    return;
  }

  const next = nextStep(session);
  if (next.step === "generate" || next.step === "review") {
    const step = next.step;
    store.runJob(`${run}:${step}`, async () => {
      const result = await call<{ session: InterviewSession }>({ step, session });
      store.updateEnvelope((envelope) => {
        if (!envelope.session || envelope.session.id !== session.id || nextStep(envelope.session).step !== step) return envelope;
        if (step === "generate") return { ...envelope, session: result.session };
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
  samples,
}: {
  store: PracticeStore;
  session: InterviewSession;
  jobs: Readonly<Record<string, JobState>>;
  run: string;
  /** Mock mode only. */
  samples?: SampleAnswers;
}) {
  const step = nextStep(session);
  const asked = session.questions.filter((q) => turnsFor(session, q.id).length > 0);
  const scoredIds = reportQuestionIds(session);
  const scored = scoredIds.filter((id) => evaluationFor(session, id)).length;
  const unanswered = new Set(unansweredQuestionIds(session));
  const failedSuggestions = [...unanswered].map((id) => `${run}:suggest:${id}`).filter((key) => jobs[key]?.status === "failed");
  const suggestFailure = failedSuggestions.length > 0 ? jobs[failedSuggestions[0]] : undefined;
  const reportJob = jobs[`${run}:report`];

  return (
    <div className="space-y-4">
      {asked.map((question, index) => {
        const turns = turnsFor(session, question.id);
        const finished = isQuestionFinished(session, question.id);
        const evaluateJob = jobs[`${run}:evaluate:${question.id}`];
        const suggestJob = jobs[`${run}:suggest:${question.id}`];
        return (
          <Card key={question.id} className="space-y-3">
            <p className="text-sm text-text-muted">
              Question {index + 1} of {session.questions.length}
            </p>
            {turns.map((turn) =>
              turn.speaker === "interviewer" ? (
                <p key={turn.id} className={turn.kind === "follow-up" ? "border-l-2 border-accent pl-3 font-semibold" : "font-semibold"}>
                  {turn.kind === "follow-up" && <span className="block text-xs font-normal text-text-muted">Follow-up</span>}
                  {turn.text}
                </p>
              ) : (
                // A follow-up skipped by "End here" is an empty answer: nothing to show.
                turn.text && (
                  <p key={turn.id} className="ml-auto max-w-[90%] whitespace-pre-wrap rounded-md bg-canvas p-3 text-sm sm:max-w-[80%]">
                    {turn.text}
                  </p>
                )
              ),
            )}
            {unanswered.has(question.id) ? (
              <p>
                {suggestionFor(session, question.id) ? (
                  <Status tone="accent">Suggested answer ready</Status>
                ) : (
                  <JobStatus
                    store={store}
                    job={suggestJob}
                    jobKey={`${run}:suggest:${question.id}`}
                    failed="Suggested answer failed"
                    working="Not answered: writing a suggested answer from your profile…"
                  />
                )}
              </p>
            ) : (
              finished && (
                <p>
                  {evaluationFor(session, question.id) ? (
                    <Status tone="accent">Scored</Status>
                  ) : (
                    <JobStatus store={store} job={evaluateJob} jobKey={`${run}:evaluate:${question.id}`} failed="Scoring failed" working="Scoring in the background…" />
                  )}
                </p>
              )
            )}
            {step.step === "answer" && step.questionId === question.id && (
              <>
                <AnswerForm
                  key={`${question.id}-${step.kind}`}
                  store={store}
                  questionId={question.id}
                  kind={step.kind}
                  sample={step.kind === "main" ? samples?.[question.id]?.main : samples?.[question.id]?.followUp}
                />
                <EndHere key={`${question.id}-${step.kind}-end`} store={store} session={session} />
              </>
            )}
            {step.step === "decide" && step.questionId === question.id && (
              <DecisionStatus store={store} job={jobs[`${run}:decide:${question.id}`]} jobKey={`${run}:decide:${question.id}`} />
            )}
          </Card>
        );
      })}

      {session.endedAt ? (
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
            // Questions never reached have no card of their own, so their failures are retried from here.
            <div className="mt-2 space-y-2">
              <Notice tone="error">{suggestFailure.message}</Notice>
              <Button onClick={() => failedSuggestions.forEach((key) => store.retryJob(key))}>Try again</Button>
            </div>
          )}
        </Card>
      ) : (
        (step.step === "evaluate" || step.step === "report") && (
          <Card>
            <h2 className="text-xl">Writing your report</h2>
            <p className="mt-2 text-text-muted">
              {scored} of {session.questions.length} answers scored.
              {step.step === "report" ? " Putting the report together…" : ""}
            </p>
            {reportJob?.status === "failed" && (
              <div className="mt-2 space-y-2">
                <Notice tone="error">{reportJob.message}</Notice>
                <Button onClick={() => store.retryJob(`${run}:report`)}>Try again</Button>
              </div>
            )}
          </Card>
        )
      )}
    </div>
  );
}

/** A background request still working, or failed with its message and Try again. */
function JobStatus({ store, job, jobKey, failed, working }: { store: PracticeStore; job?: JobState; jobKey: string; failed: string; working: string }) {
  if (job?.status !== "failed") return <Status tone="muted">{working}</Status>;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Status tone="error">{failed}</Status>
      <span className="text-sm text-error">{job.message}</span>
      <Button onClick={() => store.retryJob(jobKey)}>Try again</Button>
    </span>
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
  const heading = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (confirming) heading.current?.focus();
  }, [confirming]);

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
        <Button className="bg-surface" onClick={() => setConfirming(true)}>
          End here and see suggested answers
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-2 rounded-md border border-line bg-canvas p-3">
      <p ref={heading} tabIndex={-1} className="font-semibold">
        End the practice here?
      </p>
      <p className="text-sm">
        {answered > 0
          ? `You've answered ${answered} of ${total} questions. Those get your feedback; the other ${left} get a suggested answer built from your profile.`
          : `Each of the ${total} questions gets a suggested answer built from your profile.`}{" "}
        Anything you haven&apos;t submitted won&apos;t be saved.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => store.updateSession((current) => endEarly(current, now()))}>End practice</Button>
        <Button onClick={() => setConfirming(false)}>Keep going</Button>
      </div>
    </div>
  );
}

function DecisionStatus({ store, job, jobKey }: { store: PracticeStore; job?: JobState; jobKey: string }) {
  if (job?.status === "failed") {
    return (
      <div className="space-y-2">
        <Notice tone="error">{job.message}</Notice>
        <Button onClick={() => store.retryJob(jobKey)}>Try again</Button>
      </div>
    );
  }
  return <Status tone="muted">The interviewer is reading your answer…</Status>;
}

function AnswerForm({
  store,
  questionId,
  kind,
  sample,
}: {
  store: PracticeStore;
  questionId: string;
  kind: "main" | "follow-up";
  sample?: string | null;
}) {
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const startedAt = useRef<string | null>(null);
  const words = countWords(text);
  const markStart = () => {
    startedAt.current ??= now();
  };
  const tone = words === 0 ? "text-text-muted" : words < answerGuide.minWords ? "text-warning" : words > answerGuide.maxWords ? "text-warning" : "text-accent";

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
    <div className="space-y-2">
      <label className="block">
        <span className="text-sm font-semibold">{kind === "main" ? "Your answer" : "Your answer to the follow-up"}</span>
        <textarea
          className="mt-1 h-48 w-full rounded-md border border-text-muted bg-surface p-2 text-base"
          maxLength={limits.answerMaxChars}
          value={text}
          onFocus={markStart}
          onChange={(event) => {
            markStart();
            setText(event.target.value);
          }}
        />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={`text-sm ${tone}`} aria-live="polite">
          {words} {words === 1 ? "word" : "words"} · aim for {answerGuide.minWords} to {answerGuide.maxWords} words
        </p>
        <div className="flex flex-wrap gap-2">
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
