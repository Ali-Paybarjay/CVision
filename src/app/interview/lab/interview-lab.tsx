"use client";

// The interview lab: pick a fixture (or paste a job ad and CV in live mode), answer one question at a time,
// and read the report. The saved session drives everything: whatever it needs next is requested, so a
// reload resumes exactly where it stopped, and finished questions are scored in the background.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { AiMode } from "@/shared/ai/config";
import { answerGuide } from "@/features/interview/config";
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
import { LabDebug } from "./lab-debug";
import { LabReport } from "./lab-report";
import {
  callStep,
  clearJobs,
  getJobsSnapshot,
  getRawSnapshot,
  getServerJobsSnapshot,
  getServerRawSnapshot,
  parseEnvelope,
  retryJob,
  runJob,
  subscribe,
  updateEnvelope,
  updateSession,
  writeEnvelope,
  type JobState,
  type LabEnvelope,
} from "./lab-store";
import type { LabSource } from "./lab-types";
import { Card, Notice, PrimaryButton, SecondaryButton, Status } from "./lab-ui";

const now = () => new Date().toISOString();

/** Asks the next question as soon as the previous one is finished. */
function advance(session: InterviewSession): InterviewSession {
  const next = nextStep(session);
  return next.step === "ask" ? askQuestion(session, next.questionId, now(), crypto.randomUUID()) : session;
}

type WithUsage = { usage?: StageUsage; provenance?: Provenance };

/** Requests whatever the session needs next. Running or failed requests are not repeated (see runJob). */
function drive(envelope: LabEnvelope) {
  const { inputs, session } = envelope;
  if (!session) {
    runJob("analyse", async () => {
      const result = await callStep<{ session: InterviewSession }>({
        step: "analyse",
        inputs,
        id: crypto.randomUUID(),
        startedAt: new Date(envelope.startedAtMs).toISOString(),
      });
      updateEnvelope((current) => (current.session ? current : { ...current, session: result.session }));
    });
    return;
  }

  const next = nextStep(session);
  if (next.step === "generate" || next.step === "review") {
    const step = next.step;
    runJob(step, async () => {
      const result = await callStep<{ session: InterviewSession }>({ step, inputs, session });
      updateEnvelope((envelope) => {
        if (!envelope.session || nextStep(envelope.session).step !== step) return envelope;
        if (step === "generate") return { ...envelope, session: result.session };
        return { ...envelope, session: advance(result.session), startupMs: Date.now() - envelope.startedAtMs };
      });
    });
  }

  if (next.step === "decide") {
    const questionId = next.questionId;
    runJob(`decide:${questionId}`, async () => {
      const result = await callStep<{ decision: FollowUpDecision } & WithUsage>({ step: "follow-up", session, questionId });
      updateSession((current) =>
        decisionFor(current, questionId)
          ? current
          : advance(applyFollowUpDecision(current, result.decision, now(), crypto.randomUUID(), result.usage, result.provenance)),
      );
    });
  }

  // Each finished question is scored on its own, in the background, while the interview carries on.
  for (const question of session.questions) {
    if (!isQuestionFinished(session, question.id) || evaluationFor(session, question.id)) continue;
    runJob(`evaluate:${question.id}`, async () => {
      const result = await callStep<{ evaluation: AnswerEvaluation } & WithUsage>({ step: "evaluate", session, questionId: question.id });
      updateSession((current) => applyEvaluation(current, result.evaluation, result.usage, result.provenance));
    });
  }

  if (next.step === "report") {
    runJob("report", async () => {
      const result = await callStep<{ report: InterviewReport } & WithUsage>({ step: "report", session });
      updateSession((current) => (current.report ? current : applyReport(current, result.report, result.usage, result.provenance)));
    });
  }
}

export function InterviewLab({ mode, sources }: { mode: AiMode; sources: LabSource[] }) {
  const raw = useSyncExternalStore(subscribe, getRawSnapshot, getServerRawSnapshot);
  const jobs = useSyncExternalStore(subscribe, getJobsSnapshot, getServerJobsSnapshot);
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const envelope = useMemo(() => parseEnvelope(raw), [raw]);

  useEffect(() => {
    if (envelope) drive(envelope);
  }, [envelope, jobs]);

  const source = sources.find((s) => s.id === envelope?.sourceId);
  const session = envelope?.session ?? null;
  const restart = () => {
    writeEnvelope(null);
    clearJobs();
  };

  return (
    <main className="mx-auto w-full max-w-5xl space-y-4 px-4 py-10">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold">Interview practice lab</h1>
          {mode === "mock" ? (
            <Status tone="warning">Mock mode: fixture outputs, no AI requests</Status>
          ) : (
            <Status tone="accent">Live mode: real model requests</Status>
          )}
        </div>
        <p className="text-text-muted">
          A developer page for the technical interview engine. It is not in the menu and does not exist on the live site.
        </p>
      </header>

      {!hydrated ? (
        <p className="text-text-muted">Loading…</p>
      ) : !envelope ? (
        <Setup mode={mode} sources={sources} />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-text-muted">{source ? source.label : "Pasted job ad and CV"}</p>
            <SecondaryButton onClick={restart}>Start again</SecondaryButton>
          </div>
          <Progress session={session} jobs={jobs} startupMs={envelope.startupMs} />
          {session && nextStep(session).step === "done" ? (
            <LabReport session={session} />
          ) : (
            session && <Interview session={session} jobs={jobs} source={source} mode={mode} />
          )}
          {session && <LabDebug session={session} startupMs={envelope.startupMs} />}
        </>
      )}
    </main>
  );
}

function Setup({ mode, sources }: { mode: AiMode; sources: LabSource[] }) {
  const [choice, setChoice] = useState(sources[0]?.id ?? "paste");
  const [jobText, setJobText] = useState("");
  const [cvText, setCvText] = useState("");
  const pasting = choice === "paste";
  const chosen = sources.find((s) => s.id === choice);
  const unavailable = mode === "mock" && (pasting || chosen?.kind === "persona");
  const ready = !unavailable && (pasting ? jobText.trim().length > 0 && cvText.trim().length > 0 : Boolean(chosen));

  const start = () => {
    const inputs = pasting
      ? { jobId: `pasted-${crypto.randomUUID().slice(0, 8)}`, jobDescription: jobText.trim(), cv: cvText.trim(), parsedRequirements: null }
      : chosen!.inputs;
    clearJobs();
    writeEnvelope({ sourceId: pasting ? null : choice, inputs, session: null, startedAtMs: Date.now(), startupMs: null });
  };

  return (
    <Card className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="mb-2 font-semibold">Choose a candidate and job</legend>
        {sources.map((s) => {
          const disabled = mode === "mock" && s.kind === "persona";
          return (
            <label key={s.id} className={`flex gap-3 rounded-md border border-line p-3 ${disabled ? "opacity-60" : "cursor-pointer hover:bg-canvas"}`}>
              <input type="radio" name="source" value={s.id} checked={choice === s.id} disabled={disabled} onChange={() => setChoice(s.id)} />
              <span>
                <span className="block font-semibold">{s.label}</span>
                <span className="block text-sm text-text-muted">
                  {s.description}
                  {disabled ? " Live mode only." : ""}
                </span>
              </span>
            </label>
          );
        })}
        <label className={`flex gap-3 rounded-md border border-line p-3 ${mode === "mock" ? "opacity-60" : "cursor-pointer hover:bg-canvas"}`}>
          <input type="radio" name="source" value="paste" checked={pasting} disabled={mode === "mock"} onChange={() => setChoice("paste")} />
          <span>
            <span className="block font-semibold">Paste a job ad and CV</span>
            <span className="block text-sm text-text-muted">
              {mode === "mock" ? "Needs live mode (AI_MODE=live): mock outputs only fit the fixtures." : "Any profession, any level."}
            </span>
          </span>
        </label>
      </fieldset>

      {pasting && mode === "live" && (
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-semibold">Job ad</span>
            <textarea className="mt-1 h-56 w-full rounded-md border border-text-muted bg-surface p-2" value={jobText} onChange={(e) => setJobText(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-sm font-semibold">CV</span>
            <textarea className="mt-1 h-56 w-full rounded-md border border-text-muted bg-surface p-2" value={cvText} onChange={(e) => setCvText(e.target.value)} />
          </label>
        </div>
      )}

      <PrimaryButton onClick={start} disabled={!ready}>
        Start interview
      </PrimaryButton>
    </Card>
  );
}

const startupStages = [
  { key: "analyse", label: "Analysing the role and the CV" },
  { key: "generate", label: "Writing questions" },
  { key: "review", label: "Reviewing questions" },
] as const;

function Progress({ session, jobs, startupMs }: { session: InterviewSession | null; jobs: Readonly<Record<string, JobState>>; startupMs: number | null }) {
  const reached = !session ? 0 : !session.questions.length ? 1 : !session.reviewChangelog ? 2 : 3;
  if (reached === 3) {
    return startupMs === null ? null : <p className="text-sm text-text-muted">Questions ready. Start-up took {(startupMs / 1000).toFixed(1)} seconds.</p>;
  }
  return (
    <Card>
      <h2 className="text-xl">Preparing your interview</h2>
      <ol className="mt-3 space-y-2">
        {startupStages.map((stage, index) => {
          const job = jobs[stage.key];
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
                  <SecondaryButton onClick={() => retryJob(stage.key)}>Try again</SecondaryButton>
                </>
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function Interview({ session, jobs, source, mode }: { session: InterviewSession; jobs: Readonly<Record<string, JobState>>; source?: LabSource; mode: AiMode }) {
  const step = nextStep(session);
  const asked = session.questions.filter((q) => turnsFor(session, q.id).length > 0);
  const scored = session.questions.filter((q) => evaluationFor(session, q.id)).length;

  return (
    <div className="space-y-4">
      {asked.map((question, index) => {
        const turns = turnsFor(session, question.id);
        const finished = isQuestionFinished(session, question.id);
        const evaluateJob = jobs[`evaluate:${question.id}`];
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
                    <SecondaryButton onClick={() => retryJob(`evaluate:${question.id}`)}>Try again</SecondaryButton>
                  </span>
                ) : (
                  <Status tone="muted">Scoring in the background…</Status>
                )}
              </p>
            )}
            {step.step === "answer" && step.questionId === question.id && (
              <AnswerForm
                key={`${question.id}-${step.kind}`}
                questionId={question.id}
                kind={step.kind}
                sample={mode === "mock" ? (step.kind === "main" ? source?.samples[question.id]?.main : source?.samples[question.id]?.followUp) : undefined}
              />
            )}
            {step.step === "decide" && step.questionId === question.id && (
              <DecisionStatus job={jobs[`decide:${question.id}`]} questionId={question.id} />
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
          {jobs.report?.status === "failed" && (
            <div className="mt-2 space-y-2">
              <Notice tone="error">{jobs.report.message}</Notice>
              <SecondaryButton onClick={() => retryJob("report")}>Try again</SecondaryButton>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function DecisionStatus({ job, questionId }: { job?: JobState; questionId: string }) {
  if (job?.status === "failed") {
    return (
      <div className="space-y-2">
        <Notice tone="error">{job.message}</Notice>
        <SecondaryButton onClick={() => retryJob(`decide:${questionId}`)}>Try again</SecondaryButton>
      </div>
    );
  }
  return <Status tone="muted">The interviewer is reading your answer…</Status>;
}

function AnswerForm({ questionId, kind, sample }: { questionId: string; kind: "main" | "follow-up"; sample?: string | null }) {
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
      updateSession((session) =>
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
          className="mt-1 h-48 w-full rounded-md border border-text-muted bg-surface p-2"
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
