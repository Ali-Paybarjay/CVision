"use client";

// The interview itself, shared by the main page and the lab: answer one question at a time while finished
// questions are scored in the background. The saved session drives everything: whatever it needs next is
// requested, so a reload resumes exactly where it stopped.
import { useRef, useState } from "react";
import { answerGuide, limits } from "@/features/interview/config";
import type { AnswerEvaluation, FollowUpDecision, InterviewReport, InterviewSession, StageUsage } from "@/features/interview/contracts";
import {
  addAnswer,
  applyEvaluation,
  applyFollowUpDecision,
  applyReport,
  askQuestion,
  decisionFor,
  evaluationFor,
  isQuestionFinished,
  nextStep,
  turnsFor,
  type Provenance,
} from "@/features/interview/engine/session";
import { countWords } from "@/features/interview/engine/text";
import type { JobState, PracticeEnvelope, PracticeStore } from "./store";
import { Card, Notice, PrimaryButton, SecondaryButton, Status } from "./ui";

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
      updateSameSession(session.id, (current) =>
        decisionFor(current, questionId)
          ? current
          : advance(applyFollowUpDecision(current, result.decision, now(), crypto.randomUUID(), result.usage, result.provenance)),
      );
    });
  }

  // Each finished question is scored on its own, in the background, while the interview carries on.
  for (const question of session.questions) {
    if (!isQuestionFinished(session, question.id) || evaluationFor(session, question.id)) continue;
    store.runJob(`${run}:evaluate:${question.id}`, async () => {
      const result = await call<{ evaluation: AnswerEvaluation } & WithUsage>({ step: "evaluate", session, questionId: question.id });
      updateSameSession(session.id, (current) => applyEvaluation(current, result.evaluation, result.usage, result.provenance));
    });
  }

  if (next.step === "report") {
    store.runJob(`${run}:report`, async () => {
      const result = await call<{ report: InterviewReport } & WithUsage>({ step: "report", session });
      updateSameSession(session.id, (current) => (current.report ? current : applyReport(current, result.report, result.usage, result.provenance)));
    });
  }
}

const startupStages = [
  { key: "analyse", label: "Reading the role and your CV" },
  { key: "generate", label: "Writing questions" },
  { key: "review", label: "Checking the questions" },
] as const;

export function Progress({
  store,
  session,
  jobs,
  run,
  startupMs,
}: {
  store: PracticeStore;
  session: InterviewSession | null;
  jobs: Readonly<Record<string, JobState>>;
  run: string;
  startupMs: number | null;
}) {
  const reached = !session ? 0 : !session.questions.length ? 1 : !session.reviewChangelog ? 2 : 3;
  if (reached === 3) {
    return startupMs === null ? null : <p className="text-sm text-text-muted">Questions ready in {(startupMs / 1000).toFixed(1)} seconds.</p>;
  }
  return (
    <Card>
      <h2 className="text-xl">Preparing your interview</h2>
      <ol className="mt-3 space-y-2">
        {startupStages.map((stage, index) => {
          const job = jobs[`${run}:${stage.key}`];
          return (
            <li key={stage.key} className="flex flex-wrap items-center gap-2">
              {index < reached ? (
                <Status tone="accent">Done</Status>
              ) : job?.status === "failed" ? (
                <Status tone="error">Failed</Status>
              ) : index === reached ? (
                <Status tone="muted">Working…</Status>
              ) : (
                <Status tone="muted">Waiting</Status>
              )}
              <span>{stage.label}</span>
              {job?.status === "failed" && (
                <>
                  <span className="w-full text-sm text-error">{job.message}</span>
                  <SecondaryButton onClick={() => store.retryJob(`${run}:${stage.key}`)}>Try again</SecondaryButton>
                </>
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
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
  const scored = session.questions.filter((q) => evaluationFor(session, q.id)).length;
  const reportJob = jobs[`${run}:report`];

  return (
    <div className="space-y-4">
      {asked.map((question, index) => {
        const turns = turnsFor(session, question.id);
        const finished = isQuestionFinished(session, question.id);
        const evaluateJob = jobs[`${run}:evaluate:${question.id}`];
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
                <p key={turn.id} className="ml-auto max-w-[90%] whitespace-pre-wrap rounded-md bg-canvas p-3 text-sm sm:max-w-[80%]">
                  {turn.text}
                </p>
              ),
            )}
            {finished && (
              <p>
                {evaluationFor(session, question.id) ? (
                  <Status tone="accent">Scored</Status>
                ) : evaluateJob?.status === "failed" ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <Status tone="error">Scoring failed</Status>
                    <span className="text-sm text-error">{evaluateJob.message}</span>
                    <SecondaryButton onClick={() => store.retryJob(`${run}:evaluate:${question.id}`)}>Try again</SecondaryButton>
                  </span>
                ) : (
                  <Status tone="muted">Scoring in the background…</Status>
                )}
              </p>
            )}
            {step.step === "answer" && step.questionId === question.id && (
              <AnswerForm
                key={`${question.id}-${step.kind}`}
                store={store}
                questionId={question.id}
                kind={step.kind}
                sample={step.kind === "main" ? samples?.[question.id]?.main : samples?.[question.id]?.followUp}
              />
            )}
            {step.step === "decide" && step.questionId === question.id && (
              <DecisionStatus store={store} job={jobs[`${run}:decide:${question.id}`]} jobKey={`${run}:decide:${question.id}`} />
            )}
          </Card>
        );
      })}

      {(step.step === "evaluate" || step.step === "report") && (
        <Card>
          <h2 className="text-xl">Writing your report</h2>
          <p className="mt-2 text-text-muted">
            {scored} of {session.questions.length} answers scored.
            {step.step === "report" ? " Putting the report together…" : ""}
          </p>
          {reportJob?.status === "failed" && (
            <div className="mt-2 space-y-2">
              <Notice tone="error">{reportJob.message}</Notice>
              <SecondaryButton onClick={() => store.retryJob(`${run}:report`)}>Try again</SecondaryButton>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function DecisionStatus({ store, job, jobKey }: { store: PracticeStore; job?: JobState; jobKey: string }) {
  if (job?.status === "failed") {
    return (
      <div className="space-y-2">
        <Notice tone="error">{job.message}</Notice>
        <SecondaryButton onClick={() => store.retryJob(jobKey)}>Try again</SecondaryButton>
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
          {words} {words === 1 ? "word" : "words"} · aim for {answerGuide.minWords} to {answerGuide.maxWords}
        </p>
        <div className="flex flex-wrap gap-2">
          {sample && (
            <SecondaryButton
              onClick={() => {
                markStart();
                setText(sample);
              }}
            >
              Use sample answer
            </SecondaryButton>
          )}
          <PrimaryButton onClick={submit} disabled={text.trim() === ""}>
            Submit answer
          </PrimaryButton>
        </div>
      </div>
      {problem && <Notice tone="error">{problem}</Notice>}
    </div>
  );
}
