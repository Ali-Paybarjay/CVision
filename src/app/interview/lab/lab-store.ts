// The lab's state outside React: the saved session (in localStorage, so it survives a reload) and the requests
// in flight. Components read both with useSyncExternalStore; every change is a read-modify-write, so answers
// scored in the background never overwrite each other.
import { InterviewSessionSchema, type InterviewSession } from "@/features/interview/contracts";
import { InterviewInputsSchema, type InterviewInputs } from "@/features/interview/engine/schemas";

const storageKey = "cvision.interview-lab.v1";

export type LabEnvelope = {
  sourceId: string | null;
  inputs: InterviewInputs;
  /** null until stage 1 has run. */
  session: InterviewSession | null;
  /** Milliseconds since the epoch when Start was pressed, and the start-up time once stages 1 to 3 finish. */
  startedAtMs: number;
  startupMs: number | null;
};

let memory: string | null = null;
// Once storage fails (blocked, private window, full), the in-memory copy keeps the lab working until reload.
let storageFailed = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function readRaw(): string | null {
  if (storageFailed) return memory;
  try {
    return window.localStorage.getItem(storageKey);
  } catch {
    storageFailed = true;
    return memory;
  }
}

function writeRaw(value: string | null) {
  memory = value;
  try {
    if (value === null) window.localStorage.removeItem(storageKey);
    else window.localStorage.setItem(storageKey, value);
  } catch {
    storageFailed = true;
  }
  emit();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export const getRawSnapshot = readRaw;
export const getServerRawSnapshot = () => null;

/** Parses the saved envelope; a saved session that no longer matches the contract is dropped. */
export function parseEnvelope(raw: string | null): LabEnvelope | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    return {
      sourceId: typeof data.sourceId === "string" ? data.sourceId : null,
      inputs: InterviewInputsSchema.parse(data.inputs),
      session: data.session === null ? null : InterviewSessionSchema.parse(data.session),
      startedAtMs: Number(data.startedAtMs) || 0,
      startupMs: typeof data.startupMs === "number" ? data.startupMs : null,
    };
  } catch {
    return null;
  }
}

export function readEnvelope(): LabEnvelope | null {
  return parseEnvelope(readRaw());
}

export function writeEnvelope(envelope: LabEnvelope | null) {
  writeRaw(envelope === null ? null : JSON.stringify(envelope));
}

/** Applies a change to the saved envelope, if there is one. */
export function updateEnvelope(change: (envelope: LabEnvelope) => LabEnvelope) {
  const current = readEnvelope();
  if (current) writeEnvelope(change(current));
}

export function updateSession(change: (session: InterviewSession) => InterviewSession) {
  updateEnvelope((envelope) => (envelope.session ? { ...envelope, session: change(envelope.session) } : envelope));
}

export type JobState = { status: "running" } | { status: "failed"; message: string };

let jobs: Readonly<Record<string, JobState>> = {};

export const getJobsSnapshot = () => jobs;
const emptyJobs: Readonly<Record<string, JobState>> = {};
export const getServerJobsSnapshot = () => emptyJobs;

function setJob(key: string, state: JobState | null) {
  const next = { ...jobs };
  if (state === null) delete next[key];
  else next[key] = state;
  jobs = next;
  emit();
}

/** Runs one request unless it is already running or has failed (a failed job waits for retryJob). */
export function runJob(key: string, work: () => Promise<void>) {
  if (jobs[key]) return;
  setJob(key, { status: "running" });
  work().then(
    () => setJob(key, null),
    (error: unknown) => setJob(key, { status: "failed", message: error instanceof Error ? error.message : "Something went wrong." }),
  );
}

export function retryJob(key: string) {
  if (jobs[key]?.status === "failed") setJob(key, null);
}

export function clearJobs() {
  jobs = {};
  emit();
}

/** POSTs one engine step to the lab API and returns its JSON, or throws the API's error message. */
export async function callStep<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch("/interview/lab/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : `The request failed (${response.status}).`);
  return data as T;
}
