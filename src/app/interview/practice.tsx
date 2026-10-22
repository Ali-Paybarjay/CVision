"use client";

// Interview practice for one job. The session lives in this browser (so a reload resumes it) and, for a
// signed-in user on a saved job, in their account too: every change is saved, in order, a moment after it happens.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { answerGuide, defaultComposition } from "@/features/interview/config";
import type { InterviewSession } from "@/features/interview/contracts";
import { nextStep } from "@/features/interview/engine/session";
import { drive, InterviewFlow, Progress, runOf, type SampleAnswers } from "./_practice/flow";
import { FeedbackReport } from "./_practice/report";
import { createPracticeStore, parseEnvelope } from "./_practice/store";
import { Card, PrimaryButton, SecondaryButton, Status } from "./_practice/ui";

const store = createPracticeStore("cvision.interview.v1", "/interview/api");
const hydratedSnapshot = () => true;
const serverHydratedSnapshot = () => false;

type SaveState = "idle" | "saving" | "saved" | "failed";

// Saves run one after another, so an older session can never overwrite a newer one.
let saveQueue: Promise<unknown> = Promise.resolve();

export function InterviewPractice({
  jobId,
  signedIn,
  canSave,
  saved,
  samples,
}: {
  jobId: string;
  signedIn: boolean;
  /** False for a sample job, which has no row in the jobs table. */
  canSave: boolean;
  /** The latest session in the user's account, to resume when this browser has none. */
  saved: InterviewSession | null;
  /** Mock mode only. */
  samples?: SampleAnswers;
}) {
  const raw = useSyncExternalStore(store.subscribe, store.getRawSnapshot, store.getServerRawSnapshot);
  const jobs = useSyncExternalStore(store.subscribe, store.getJobsSnapshot, store.getServerJobsSnapshot);
  const hydrated = useSyncExternalStore(store.subscribe, hydratedSnapshot, serverHydratedSnapshot);
  const stored = useMemo(() => parseEnvelope(raw), [raw]);
  // This browser keeps one practice at a time; another job's practice is replaced only when a new one starts here.
  const envelope = stored?.sourceId === jobId ? stored : null;
  const session = envelope?.session ?? null;
  const autoSave = signedIn && canSave;

  // Resume from the account once, when this browser has nothing for this job.
  const resumed = useRef(false);
  useEffect(() => {
    if (!hydrated || resumed.current) return;
    resumed.current = true;
    if (!envelope && saved) {
      store.writeEnvelope({ sourceId: jobId, inputs: null, session: saved, startedAtMs: Date.parse(saved.startedAt), startupMs: null });
    }
  }, [hydrated, envelope, saved, jobId]);

  useEffect(() => {
    if (envelope) drive(store, envelope, { jobId });
  }, [envelope, jobs, jobId]);

  const [saveState, setSaveState] = useState<SaveState>("idle");
  useEffect(() => {
    if (!autoSave || !session) return;
    const timer = setTimeout(() => {
      setSaveState("saving");
      saveQueue = saveQueue
        .then(() => store.callStep<{ saved: boolean }>({ step: "save", jobId, session }))
        .then(
          (result) => setSaveState(result.saved ? "saved" : "failed"),
          () => setSaveState("failed"),
        );
    }, 1000);
    return () => clearTimeout(timer);
  }, [autoSave, session, jobId]);

  const start = () => {
    store.clearJobs();
    store.writeEnvelope({ sourceId: jobId, inputs: null, session: null, startedAtMs: Date.now(), startupMs: null });
  };
  const restart = () => {
    store.writeEnvelope(null);
    store.clearJobs();
    setSaveState("idle");
  };

  if (!hydrated) return <p className="text-text-muted">Loading…</p>;
  if (!envelope) return <Intro signedIn={signedIn} canSave={canSave} onStart={start} />;

  const done = session !== null && nextStep(session).step === "done";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SaveStatus autoSave={autoSave} signedIn={signedIn} state={saveState} />
        <SecondaryButton onClick={restart}>{done ? "Practise again" : "Start again"}</SecondaryButton>
      </div>
      <Progress store={store} session={session} jobs={jobs} run={runOf(envelope)} startupMs={envelope.startupMs} />
      {session && done ? (
        <FeedbackReport session={session} />
      ) : (
        session && <InterviewFlow store={store} session={session} jobs={jobs} run={runOf(envelope)} samples={samples} />
      )}
    </div>
  );
}

function Intro({ signedIn, canSave, onStart }: { signedIn: boolean; canSave: boolean; onStart: () => void }) {
  return (
    <Card className="space-y-4">
      <h2 className="text-xl">How it works</h2>
      <ul className="list-disc space-y-2 pl-5">
        <li>{defaultComposition.technical} technical questions, written from this job ad and your CV.</li>
        <li>
          Type each answer: aim for {answerGuide.minWords} to {answerGuide.maxWords} words, about {answerGuide.suggestedMinutes} minutes. The
          interviewer may ask one follow-up.
        </li>
        <li>At the end, for every answer: what worked, what cost you marks and one thing to do next time.</li>
      </ul>
      <p className="text-sm text-text-muted">
        {!signedIn
          ? "Sign in to keep this practice in your account. Until then it stays in this browser."
          : canSave
            ? "Your practice is saved to your account as you go."
            : "This is a sample job, so this practice stays in this browser only."}
      </p>
      <PrimaryButton onClick={onStart}>Start practice</PrimaryButton>
    </Card>
  );
}

function SaveStatus({ autoSave, signedIn, state }: { autoSave: boolean; signedIn: boolean; state: SaveState }) {
  if (!autoSave) return <p className="text-sm text-text-muted">{signedIn ? "Sample job: kept in this browser only." : "Kept in this browser only."}</p>;
  if (state === "failed") return <Status tone="error">Not saved to your account. It will try again with your next answer.</Status>;
  if (state === "saved") return <Status tone="accent">Saved to your account</Status>;
  return <Status tone="muted">{state === "saving" ? "Saving…" : "Saved as you go"}</Status>;
}
