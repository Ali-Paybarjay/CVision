// A practice interview's state outside React: the saved session (in localStorage, so it survives a reload) and the
// requests in flight. Components read both with useSyncExternalStore; every change is a read-modify-write, so
// answers scored in the background never overwrite each other. The lab and the main page each create their own.
import { InterviewSessionSchema, type InterviewSession } from "@/features/interview/contracts";
import { InterviewInputsSchema, type InterviewInputs } from "@/features/interview/engine/schemas";

export type PracticeEnvelope = {
  /** The lab's fixture or persona id, or the job id on the main page. */
  sourceId: string | null;
  /** The job ad and CV, sent with each request by the lab only. The main page's API reads them on the server. */
  inputs: InterviewInputs | null;
  /** null until stage 1 has run. */
  session: InterviewSession | null;
  /** Milliseconds since the epoch when Start was pressed, and the start-up time once stages 1 to 3 finish. */
  startedAtMs: number;
  startupMs: number | null;
};

export type JobState = { status: "running" } | { status: "failed"; message: string };

const emptyJobs: Readonly<Record<string, JobState>> = {};

/** Browsers refuse keepalive requests whose bodies add up to more than 64 KB. */
const keepaliveLimitBytes = 60_000;

/** Parses a saved envelope; a saved session that no longer matches the contract is dropped. */
export function parseEnvelope(raw: string | null): PracticeEnvelope | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    return {
      sourceId: typeof data.sourceId === "string" ? data.sourceId : null,
      inputs: data.inputs == null ? null : InterviewInputsSchema.parse(data.inputs),
      session: data.session === null ? null : InterviewSessionSchema.parse(data.session),
      startedAtMs: Number(data.startedAtMs) || 0,
      startupMs: typeof data.startupMs === "number" ? data.startupMs : null,
    };
  } catch {
    return null;
  }
}

/** Runs `work` only in the tab that holds the lock; any other tab waits until it is released and runs nothing. */
async function withTabLock(name: string, work: () => Promise<void>): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.locks) return work();
  await navigator.locks.request(name, { ifAvailable: true }, async (lock) => {
    if (lock) await work();
    else await navigator.locks.request(name, () => undefined);
  });
}

export function createPracticeStore(storageKey: string, endpoint: string) {
  let memory: string | null = null;
  // Once storage fails (blocked, private window, full), the in-memory copy keeps the page working until reload.
  let storageFailed = false;
  const listeners = new Set<() => void>();
  let jobs: Readonly<Record<string, JobState>> = {};
  // Jobs run with `once` that have succeeded in this tab.
  const succeeded = new Set<string>();

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

  function readEnvelope(): PracticeEnvelope | null {
    return parseEnvelope(readRaw());
  }

  function writeEnvelope(envelope: PracticeEnvelope | null) {
    writeRaw(envelope === null ? null : JSON.stringify(envelope));
  }

  /** Applies a change to the saved envelope, if there is one. */
  function updateEnvelope(change: (envelope: PracticeEnvelope) => PracticeEnvelope) {
    const current = readEnvelope();
    if (current) writeEnvelope(change(current));
  }

  function setJob(key: string, state: JobState | null) {
    const next = { ...jobs };
    if (state === null) delete next[key];
    else next[key] = state;
    jobs = next;
    emit();
  }

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      window.addEventListener("storage", listener);
      return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", listener);
      };
    },
    getRawSnapshot: readRaw,
    getServerRawSnapshot: () => null,
    getJobsSnapshot: () => jobs,
    getServerJobsSnapshot: () => emptyJobs,
    readEnvelope,
    writeEnvelope,
    updateEnvelope,
    updateSession(change: (session: InterviewSession) => InterviewSession) {
      updateEnvelope((envelope) => (envelope.session ? { ...envelope, session: change(envelope.session) } : envelope));
    },
    /**
     * Runs one request unless it is already running or has failed (a failed job waits for retryJob). Tabs share
     * the session, so a tab that finds another tab already running the same request waits for it instead; the
     * result arrives through storage, and if the other tab failed, this tab's next drive runs it. A job whose
     * success leaves no mark on the session runs with `once`, so the next drive does not send it again.
     */
    runJob(key: string, work: () => Promise<void>, options: { once?: boolean } = {}) {
      if (jobs[key] || succeeded.has(key)) return;
      setJob(key, { status: "running" });
      withTabLock(`${storageKey}:${key}`, work).then(
        () => {
          if (options.once) succeeded.add(key);
          setJob(key, null);
        },
        (error: unknown) => setJob(key, { status: "failed", message: error instanceof Error ? error.message : "Something went wrong." }),
      );
    },
    retryJob(key: string) {
      if (jobs[key]?.status === "failed") setJob(key, null);
    },
    clearJobs() {
      jobs = {};
      succeeded.clear();
      emit();
    },
    /**
     * POSTs one engine step to the API and returns its JSON, or throws the API's error message. With `keepalive`,
     * the request outlives the page when it fits the browser's 64 KB keepalive limit.
     */
    async callStep<T>(body: Record<string, unknown>, options: { keepalive?: boolean } = {}): Promise<T> {
      const json = JSON.stringify(body);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: json,
        keepalive: options.keepalive && new Blob([json]).size < keepaliveLimitBytes,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : `The request failed (${response.status}).`);
      return data as T;
    },
  };
}

export type PracticeStore = ReturnType<typeof createPracticeStore>;
