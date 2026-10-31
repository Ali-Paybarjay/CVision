"use client";

// The interview lab: pick a fixture (or paste a job ad and CV in live mode), run the same interview as the main
// page, and read the report with the debug panel. The job ad and CV go with every request (see drive).
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { AiMode } from "@/shared/ai/config";
import { limits } from "@/features/interview/config";
import { nextStep } from "@/features/interview/engine/session";
import { drive, InterviewFlow, runOf } from "../_practice/flow";
import { Progress } from "../_practice/progress";
import { FeedbackReport } from "../_practice/report";
import { createPracticeStore, parseEnvelope } from "../_practice/store";
import { Button, Card } from "@/shared/ui";
import { Status } from "../_practice/ui";
import { LabDebug } from "./lab-debug";
import type { LabSource } from "./lab-types";

const store = createPracticeStore("cvision.interview-lab.v1", "/interview/lab/api");
const hydratedSnapshot = () => true;
const serverHydratedSnapshot = () => false;

export function InterviewLab({ mode, sources }: { mode: AiMode; sources: LabSource[] }) {
  const raw = useSyncExternalStore(store.subscribe, store.getRawSnapshot, store.getServerRawSnapshot);
  const jobs = useSyncExternalStore(store.subscribe, store.getJobsSnapshot, store.getServerJobsSnapshot);
  const hydrated = useSyncExternalStore(store.subscribe, hydratedSnapshot, serverHydratedSnapshot);
  const envelope = useMemo(() => parseEnvelope(raw), [raw]);

  useEffect(() => {
    if (envelope?.inputs) drive(store, envelope, { inputs: envelope.inputs });
  }, [envelope, jobs]);

  const source = sources.find((s) => s.id === envelope?.sourceId);
  const session = envelope?.session ?? null;
  const restart = () => {
    store.writeEnvelope(null);
    store.clearJobs();
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
      ) : !envelope?.inputs ? (
        <Setup mode={mode} sources={sources} />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-text-muted">{source ? source.label : "Pasted job ad and CV"}</p>
            <Button onClick={restart}>Start again</Button>
          </div>
          <Progress store={store} session={session} jobs={jobs} run={runOf(envelope)} startedAtMs={envelope.startedAtMs} startupMs={envelope.startupMs} />
          {session && nextStep(session).step === "done" ? (
            <FeedbackReport session={session} />
          ) : (
            session && (
              <InterviewFlow store={store} session={session} jobs={jobs} run={runOf(envelope)} samples={mode === "mock" ? source?.samples : undefined} />
            )
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
    store.clearJobs();
    store.writeEnvelope({ sourceId: pasting ? null : choice, inputs, session: null, startedAtMs: Date.now(), startupMs: null });
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
            <textarea className="mt-1 h-56 w-full rounded-md border border-text-muted bg-surface p-2" maxLength={limits.jobDescriptionMaxChars} value={jobText} onChange={(e) => setJobText(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-sm font-semibold">CV</span>
            <textarea className="mt-1 h-56 w-full rounded-md border border-text-muted bg-surface p-2" maxLength={limits.cvMaxChars} value={cvText} onChange={(e) => setCvText(e.target.value)} />
          </label>
        </div>
      )}

      <Button variant="primary" onClick={start} disabled={!ready}>
        Start interview
      </Button>
    </Card>
  );
}
