"use client";

import { useState, useTransition } from "react";
import { answerGap, decideChange } from "@/features/tailor/actions";
import { buildTailoredCv } from "@/features/tailor/tailored-cv";
import type { GapAnswer, NextStep } from "@/features/tailor/types";
import type { Gap, Profile, TailoringChange, TailoringStatus } from "@/shared/contracts";
import { Button, Card, CvPaper, Field, FitLine, Notice, Textarea } from "@/shared/ui";
import { CoverLetterPanel, type LetterState } from "./cover-letter-panel";
import { CvPreview } from "./cv-preview";

export type GapPrompt = { gap: Gap; question: string; sampleAnswer: string | null };

type GapState =
  | { phase: "open" }
  | { phase: "working" }
  | { phase: "answered"; nextSteps: NextStep[] }
  | { phase: "error"; message: string };

const sectionNames: Record<TailoringChange["section"], string> = {
  summary: "Professional summary",
  skills: "Skills",
  experience: "Experience",
  education: "Education",
  certifications: "Additional information",
};

/**
 * The Tailor workspace for one job: a question per gap, the suggested changes with Approve, Reject and Edit,
 * and the CV preview, which shows approved changes only.
 */
export function TailorWorkspace({ jobId, profile, prompts }: { jobId: string; profile: Profile; prompts: GapPrompt[] }) {
  const [gapStates, setGapStates] = useState<Record<string, GapState>>({});
  const [changes, setChanges] = useState<TailoringChange[]>([]);
  const [answers, setAnswers] = useState<Record<string, GapAnswer>>({});
  const [letter, setLetter] = useState<LetterState | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);

  const counts = {
    approved: changes.filter((change) => change.status === "approved").length,
    rejected: changes.filter((change) => change.status === "rejected").length,
    waiting: changes.filter((change) => change.status === "proposed").length,
  };

  const onAnswered = (answer: GapAnswer, newChanges: TailoringChange[], nextSteps: NextStep[]) => {
    const { gapId } = answer;
    setAnswers((current) => ({ ...current, [gapId]: answer }));
    setChanges((current) => [...current.filter((change) => change.gapId !== gapId), ...newChanges]);
    setGapStates((current) => ({ ...current, [gapId]: { phase: "answered", nextSteps } }));
  };

  const update = async (next: TailoringChange) => {
    setChanges((current) => current.map((change) => (change.id === next.id ? next : change)));
    const result = await decideChange(next);
    setSaveNote(result.saved ? null : result.message);
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,32rem)]">
      <div className="flex flex-col gap-8">
        <p className="rounded-md border border-line bg-surface px-4 py-3 text-sm" aria-live="polite">
          <span className="font-semibold">✓ Approved: {counts.approved}</span> · ✕ Rejected: {counts.rejected} · Waiting:{" "}
          {counts.waiting}. Only approved changes go into your CV.
        </p>
        {saveNote && <Notice tone="info">{saveNote}</Notice>}

        <section className="flex flex-col gap-4" aria-labelledby="questions-heading">
          <h2 id="questions-heading" className="text-xl">
            Questions about your experience
          </h2>
          {prompts.length === 0 && (
            <Notice tone="success" title="Your CV already covers this job's requirements.">
              There is nothing to ask. Check your CV on this page before you apply.
            </Notice>
          )}
          {prompts.map((prompt) => (
            <GapCard
              key={prompt.gap.id}
              jobId={jobId}
              prompt={prompt}
              state={gapStates[prompt.gap.id] ?? { phase: "open" }}
              setState={(state) => setGapStates((current) => ({ ...current, [prompt.gap.id]: state }))}
              onAnswered={onAnswered}
              changes={changes.filter((change) => change.gapId === prompt.gap.id)}
              onDecide={update}
            />
          ))}
        </section>

        <CoverLetterPanel
          jobId={jobId}
          changes={changes}
          answers={Object.values(answers)}
          letter={letter}
          setLetter={setLetter}
        />
      </div>

      <aside className="flex flex-col gap-3 lg:sticky lg:top-6 lg:self-start" aria-labelledby="preview-heading">
        <h2 id="preview-heading" className="text-xl">
          Your CV for this job
        </h2>
        <p className="text-sm text-text-muted">Highlighted lines are the changes you approved.</p>
        <CvPreview cv={buildTailoredCv(profile, changes)} />
      </aside>
    </div>
  );
}

type GapCardProps = {
  jobId: string;
  prompt: GapPrompt;
  state: GapState;
  setState: (state: GapState) => void;
  onAnswered: (answer: GapAnswer, changes: TailoringChange[], nextSteps: NextStep[]) => void;
  changes: TailoringChange[];
  onDecide: (change: TailoringChange) => Promise<void>;
};

function GapCard({ jobId, prompt, state, setState, onAnswered, changes, onDecide }: GapCardProps) {
  const [answer, setAnswer] = useState(prompt.sampleAnswer ?? "");
  const [pending, startTransition] = useTransition();
  const { gap } = prompt;

  const submit = (hasExperience: boolean) => {
    setState({ phase: "working" });
    startTransition(async () => {
      const result = await answerGap({ jobId, gapId: gap.id, answer, hasExperience });
      const given: GapAnswer = { gapId: gap.id, question: prompt.question, answer: answer.trim(), hasExperience };
      if (result.ok) onAnswered(given, result.changes, result.nextSteps);
      else setState({ phase: "error", message: result.message });
    });
  };

  return (
    <Card as="article" className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-semibold tracking-wide text-text-muted uppercase">
          {gap.importance === "essential" ? "Essential" : "Desirable"} · {gap.requirement}
        </p>
        <p className="mt-2 font-semibold">{prompt.question}</p>
      </div>

      {state.phase !== "answered" && (
        <>
          <Field
            label="Your answer"
            hint={prompt.sampleAnswer ? "Sample answer for the sample CV. Change it if you like." : "In your own words: where, what you did and what changed."}
            error={state.phase === "error" ? state.message : undefined}
          >
            {(props) => <Textarea {...props} value={answer} onChange={(event) => setAnswer(event.target.value)} maxLength={2000} />}
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => submit(true)} disabled={pending}>
              {pending ? "Writing a suggestion…" : "Suggest a change"}
            </Button>
            <Button variant="quiet" onClick={() => submit(false)} disabled={pending}>
              I haven’t done this
            </Button>
          </div>
        </>
      )}

      {state.phase === "answered" && (
        <>
          {changes.map((change) => (
            <ChangeCard key={change.id} change={change} onDecide={onDecide} />
          ))}
          {state.nextSteps.map((step, index) => (
            <Notice key={index} tone="info" title="Not added to your CV">
              {step.kind === "learn" ? "A way to build it: " : "Your closest real skill: "}
              {step.suggestion}
            </Notice>
          ))}
          <div>
            <Button variant="quiet" onClick={() => setState({ phase: "open" })}>
              Change my answer
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

function ChangeCard({ change, onDecide }: { change: TailoringChange; onDecide: (change: TailoringChange) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(change.after);
  const [pending, startTransition] = useTransition();

  const decide = (status: TailoringStatus, after = change.after) =>
    startTransition(async () => {
      await onDecide({ ...change, status, after });
      setEditing(false);
    });

  const statusText =
    change.status === "approved" ? "✓ Approved" : change.status === "rejected" ? "✕ Rejected" : "Waiting for your decision";

  return (
    <div className="flex flex-col gap-3 rounded-md border border-line p-4">
      <p className="text-xs font-semibold tracking-wide text-text-muted uppercase">{sectionNames[change.section]}</p>

      <CvPaper as="div" className="text-sm">
        <p className="text-xs font-semibold text-text-muted">Before</p>
        <p className="mt-1 text-text-muted line-through">{change.before ?? "New line"}</p>
        <p className="mt-4 text-xs font-semibold text-text-muted">After</p>
        <FitLine className="mt-1">{change.after}</FitLine>
      </CvPaper>

      <p className="text-sm text-text-muted">
        <span className="font-semibold">From what you told us:</span> “{change.evidence}”
      </p>

      {editing ? (
        <div className="flex flex-col gap-3">
          <Field label="Edit the suggested line" hint="Keep it true: only what you have actually done.">
            {(props) => <Textarea {...props} value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={600} />}
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => decide("approved", draft.trim())} disabled={pending || draft.trim() === ""}>
              Save and approve
            </Button>
            <Button variant="quiet" onClick={() => (setDraft(change.after), setEditing(false))}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() => decide("approved")}
            aria-pressed={change.status === "approved"}
            disabled={pending}
            className="aria-pressed:bg-accent aria-pressed:text-surface"
          >
            Approve
          </Button>
          <Button
            onClick={() => decide("rejected")}
            aria-pressed={change.status === "rejected"}
            disabled={pending}
            className="aria-pressed:bg-emphasis aria-pressed:text-on-emphasis"
          >
            Reject
          </Button>
          <Button variant="quiet" onClick={() => setEditing(true)} disabled={pending}>
            Edit
          </Button>
          {change.status !== "proposed" && (
            <Button variant="quiet" onClick={() => decide("proposed")} disabled={pending}>
              Undo
            </Button>
          )}
          <span className="text-sm text-text-muted" aria-live="polite">
            {statusText}
          </span>
        </div>
      )}
    </div>
  );
}
