"use client";

// Interview practice for one job. The session lives in this browser (so a reload resumes it) and, for a
// signed-in user on a saved job, in their account too: every change is saved, in order, a moment after it happens.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { answerGuide, defaultComposition } from "@/features/interview/config";
import type { InterviewSession } from "@/features/interview/contracts";
import { nextStep, openingView } from "@/features/interview/engine/session";
import type { LastReport } from "@/features/interview/server/session-store";
import { drive, InterviewFlow, Progress, runOf, type SampleAnswers } from "./_practice/flow";
import { FeedbackReport } from "./_practice/report";
import { createPracticeStore, parseEnvelope, type PracticeStore } from "./_practice/store";
import { Button, Card } from "@/shared/ui";
import { practisedOn, Status } from "./_practice/ui";

// One practice per job, each under its own key, so opening another job never replaces a practice in progress.
const stores = new Map<string, PracticeStore>();
const legacyKey = "cvision.interview.v1";

function storeFor(jobId: string): PracticeStore {
  let store = stores.get(jobId);
  if (!store) {
    const key = `${legacyKey}:${jobId}`;
    moveLegacyPractice(jobId, key);
    store = createPracticeStore(key, "/interview/api");
    stores.set(jobId, store);
  }
  return store;
}

/** Before practices had a key per job, the browser kept one practice under one key: move it to its job's key. */
function moveLegacyPractice(jobId: string, key: string) {
  if (typeof window === "undefined") return;
  try {
    const legacy = window.localStorage.getItem(legacyKey);
    if (legacy === null || parseEnvelope(legacy)?.sourceId !== jobId) return;
    if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, legacy);
    window.localStorage.removeItem(legacyKey);
  } catch {
    // Storage is blocked: the store keeps the practice in memory instead.
  }
}

const hydratedSnapshot = () => true;
const serverHydratedSnapshot = () => false;

type SaveState = "idle" | "saving" | "saved" | "retrying" | "failed";

/** A failed save is tried again after each of these delays, then waits for the next change or a reload. */
const retryDelaysMs = [5_000, 15_000, 45_000];

// Saves run one after another, so an older session can never overwrite a newer one.
let saveQueue: Promise<unknown> = Promise.resolve();

export function InterviewPractice({
  jobId,
  signedIn,
  canSave,
  saved,
  lastReport,
  samples,
}: {
  jobId: string;
  signedIn: boolean;
  /** False for a sample job, which has no row in the jobs table. */
  canSave: boolean;
  /** The latest session in the user's account, to resume when this browser has none. */
  saved: InterviewSession | null;
  /** The account's latest finished practice, shown first when this browser has nothing for this job (#206). */
  lastReport: LastReport | null;
  /** Mock mode only. */
  samples?: SampleAnswers;
}) {
  const store = storeFor(jobId);
  const raw = useSyncExternalStore(store.subscribe, store.getRawSnapshot, store.getServerRawSnapshot);
  const jobs = useSyncExternalStore(store.subscribe, store.getJobsSnapshot, store.getServerJobsSnapshot);
  const hydrated = useSyncExternalStore(store.subscribe, hydratedSnapshot, serverHydratedSnapshot);
  const stored = useMemo(() => parseEnvelope(raw), [raw]);
  const envelope = stored?.sourceId === jobId ? stored : null;
  const session = envelope?.session ?? null;
  const autoSave = signedIn && canSave;

  // Set by "Practise again", so the page goes to the intro rather than back to the account's last report.
  const [practiseAgain, setPractiseAgain] = useState(false);
  const view = openingView({ inBrowser: envelope, saved, lastReport: lastReport?.session ?? null, practiseAgain });

  // Resume from the account once: when this browser has nothing for this job, or an older copy of it (another
  // device went further). A finished session is not resumed into an empty browser: its report is shown read-only.
  const resumed = useRef(false);
  // The session as the account holds it, so an unchanged session is not sent back.
  const accountCopy = useRef(saved ? JSON.stringify(saved) : null);
  useEffect(() => {
    if (!hydrated || resumed.current) return;
    resumed.current = true;
    if (saved && view === "resume") {
      store.writeEnvelope({ sourceId: jobId, inputs: null, session: saved, startedAtMs: Date.parse(saved.startedAt), startupMs: null });
    }
  }, [store, hydrated, view, saved, jobId]);

  useEffect(() => {
    if (envelope) drive(store, envelope, { jobId });
  }, [store, envelope, jobs, jobId]);

  const [saveState, setSaveState] = useState<SaveState>("idle");
  // Failed saves of the current session; a new value of `retry` runs the effect again.
  const failures = useRef({ json: "", count: 0 });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!autoSave || !session || !resumed.current) return;
    const json = JSON.stringify(session);
    if (json === accountCopy.current) return;
    const failed = failures.current.json === json ? failures.current.count : 0;
    if (failed > retryDelaysMs.length) return;
    let started = false;
    const save = (keepalive: boolean) => {
      if (started) return;
      started = true;
      setSaveState("saving");
      saveQueue = saveQueue
        .then(() => store.callStep<{ saved: boolean }>({ step: "save", jobId, session }, { keepalive }))
        .then(
          (result) => result.saved,
          () => false,
        )
        .then((ok) => {
          if (ok) {
            accountCopy.current = json;
            setSaveState("saved");
            return;
          }
          failures.current = { json, count: failed + 1 };
          const again = failed < retryDelaysMs.length;
          setSaveState(again ? "retrying" : "failed");
          if (again) setRetry((n) => n + 1);
        });
    };
    const timer = setTimeout(() => save(false), failed === 0 ? 1000 : retryDelaysMs[failed - 1]);
    // Leaving the page (closing it, switching tab or app) saves at once rather than after the delay. A session too
    // big for keepalive may not finish if the page is closing; this browser still has it and saves it on the next visit.
    const saveNow = () => {
      clearTimeout(timer);
      save(true);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") saveNow();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", saveNow);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", saveNow);
    };
  }, [store, autoSave, session, jobId, retry]);

  const start = () => {
    store.clearJobs();
    store.writeEnvelope({ sourceId: jobId, inputs: null, session: null, startedAtMs: Date.now(), startupMs: null });
  };
  const restart = () => {
    store.writeEnvelope(null);
    store.clearJobs();
    setSaveState("idle");
    setPractiseAgain(true);
  };

  if (!hydrated) return <p className="text-text-muted">Loading…</p>;
  if (!envelope) {
    if (view === "last-report" && lastReport) return <LastPractice report={lastReport} onPractiseAgain={() => setPractiseAgain(true)} />;
    return <Intro signedIn={signedIn} canSave={canSave} onStart={start} focusHeading={practiseAgain} />;
  }

  const done = session !== null && nextStep(session).step === "done";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SaveStatus autoSave={autoSave} signedIn={signedIn} state={saveState} />
        {!done && <Button onClick={restart}>Start again</Button>}
      </div>
      <Progress store={store} session={session} jobs={jobs} run={runOf(envelope)} startupMs={envelope.startupMs} />
      {session && done ? (
        <>
          <FeedbackReport session={session} />
          <PractiseAgain onPractiseAgain={restart} />
        </>
      ) : (
        session && <InterviewFlow store={store} session={session} jobs={jobs} run={runOf(envelope)} samples={samples} />
      )}
    </div>
  );
}

export function LastPractice({ report, onPractiseAgain }: { report: LastReport; onPractiseAgain: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-muted">
        Your last practice · <time dateTime={report.practisedAt}>{practisedOn(report.practisedAt)}</time>
      </p>
      <FeedbackReport session={report.session} />
      <PractiseAgain onPractiseAgain={onPractiseAgain} />
    </div>
  );
}

/** Below the report, not above it, so the feedback is read before a new practice starts. */
function PractiseAgain({ onPractiseAgain }: { onPractiseAgain: () => void }) {
  return (
    <Card className="space-y-4">
      <p>Read your feedback first. When you are ready, practise again.</p>
      <Button onClick={onPractiseAgain}>Practise again</Button>
    </Card>
  );
}

function Intro({ signedIn, canSave, onStart, focusHeading }: { signedIn: boolean; canSave: boolean; onStart: () => void; focusHeading: boolean }) {
  // After "Practise again" or "Start again", the button that was pressed is gone: focus (and the view) moves here.
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusHeading) headingRef.current?.focus();
  }, [focusHeading]);

  return (
    <Card className="space-y-4">
      <h2 ref={headingRef} tabIndex={-1} className="text-xl">
        How it works
      </h2>
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
      <Button variant="primary" onClick={onStart}>Start practice</Button>
    </Card>
  );
}

function SaveStatus({ autoSave, signedIn, state }: { autoSave: boolean; signedIn: boolean; state: SaveState }) {
  if (!autoSave) return <p className="text-sm text-text-muted">{signedIn ? "Sample job: kept in this browser only." : "Kept in this browser only."}</p>;
  if (state === "retrying") return <Status tone="error">Not saved to your account yet. Trying again…</Status>;
  if (state === "failed") return <Status tone="error">Not saved to your account. It is kept in this browser: reload the page to try again.</Status>;
  if (state === "saved") return <Status tone="accent">Saved to your account</Status>;
  return <Status tone="muted">{state === "saving" ? "Saving…" : "Saved as you go"}</Status>;
}
