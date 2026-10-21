// The collapsible debug panel: what the engine knows and decided, and what each stage cost.
import type { InterviewSession } from "@/features/interview/contracts";
import { usageTotals } from "@/features/interview/engine/usage";
import type { ReactNode } from "react";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="border-t border-line py-2">
      <summary className="cursor-pointer font-semibold">{title}</summary>
      <div className="mt-2 overflow-x-auto text-sm">{children}</div>
    </details>
  );
}

function Json({ value }: { value: unknown }) {
  return <pre className="max-h-96 overflow-auto rounded-md bg-canvas p-3 text-xs">{JSON.stringify(value, null, 2)}</pre>;
}

function money(value: number): string {
  return `$${value.toFixed(4)}`;
}

export function LabDebug({ session, startupMs }: { session: InterviewSession; startupMs: number | null }) {
  const usage = session.usage ?? [];
  const totals = usageTotals(usage);
  return (
    <details className="rounded-lg border border-line bg-surface p-4">
      <summary className="cursor-pointer text-lg font-semibold">Debug panel</summary>
      <p className="mt-2 text-sm text-text-muted">
        Mode: {session.versions?.mode ?? "unknown"} · Start-up: {startupMs === null ? "not finished" : `${(startupMs / 1000).toFixed(1)} s`}
      </p>

      <Section title="Role profile">
        <Json value={session.roleProfile} />
      </Section>
      <Section title="Candidate profile">
        <Json value={session.candidateProfile} />
      </Section>
      <Section title="Blueprint">
        {session.blueprint && (
          <>
            {session.blueprint.mixNote && <p className="mb-2">Mix note: {session.blueprint.mixNote}</p>}
            <table className="w-full text-left">
              <thead className="text-text-muted">
                <tr>
                  <th className="pr-3">Question</th>
                  <th className="pr-3">Type</th>
                  <th className="pr-3">Competency</th>
                  <th className="pr-3">Focus</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {session.blueprint.slots.map((slot) => (
                  <tr key={slot.questionId} className="border-t border-line align-top">
                    <td className="pr-3">{slot.questionId}</td>
                    <td className="pr-3">{slot.type}</td>
                    <td className="pr-3">{slot.competencyId}</td>
                    <td className="pr-3">{slot.focus}</td>
                    <td>{slot.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Section>
      <Section title="Rubric for each question">
        {session.questions.map((question) => (
          <div key={question.id} className="mb-4">
            <p className="font-semibold">
              {question.id} · {question.type} · {question.competencyId} · {question.level}
              {question.stretch ? " · stretch" : ""}
            </p>
            <p>{question.text}</p>
            <p className="mt-1 text-text-muted">Look-fors:</p>
            <ul className="list-disc pl-5">
              {question.lookFors?.map((lookFor) => (
                <li key={lookFor.id}>
                  {lookFor.text} ({lookFor.confidence})
                </li>
              ))}
            </ul>
            <p className="mt-1 text-text-muted">Anchors:</p>
            <ul className="list-disc pl-5">
              <li>1: {question.anchors?.score1}</li>
              <li>3: {question.anchors?.score3}</li>
              <li>5: {question.anchors?.score5}</li>
            </ul>
            <p className="mt-1 text-text-muted">Red flags: {question.redFlags?.join("; ")}</p>
            <p className="mt-1 text-text-muted">Planned follow-ups:</p>
            <ul className="list-disc pl-5">
              {question.followUps?.map((followUp) => (
                <li key={followUp.id}>
                  {followUp.id} ({followUp.gapType}): {followUp.text}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Section>
      <Section title="Follow-up decisions">
        <Json value={session.followUpDecisions} />
      </Section>
      <Section title="Review changelog">
        <Json value={session.reviewChangelog} />
      </Section>
      <Section title="Tokens and estimated cost">
        <p className="mb-2 text-text-muted">
          Estimated from text length while askModel does not report usage; thinking tokens are not included.
        </p>
        <table className="w-full text-left">
          <thead className="text-text-muted">
            <tr>
              <th className="pr-3">Stage</th>
              <th className="pr-3">Question</th>
              <th className="pr-3">Model</th>
              <th className="pr-3">Input</th>
              <th className="pr-3">Output</th>
              <th>Cost</th>
            </tr>
          </thead>
          <tbody>
            {usage.map((entry, index) => (
              <tr key={index} className="border-t border-line">
                <td className="pr-3">{entry.stage}</td>
                <td className="pr-3">{entry.questionId ?? ""}</td>
                <td className="pr-3">{entry.model}</td>
                <td className="pr-3">{entry.inputTokens}</td>
                <td className="pr-3">{entry.outputTokens}</td>
                <td>{money(entry.costUsd)}</td>
              </tr>
            ))}
            <tr className="border-t border-line font-semibold">
              <td className="pr-3" colSpan={3}>
                Total
              </td>
              <td className="pr-3">{totals.inputTokens}</td>
              <td className="pr-3">{totals.outputTokens}</td>
              <td>{money(totals.costUsd)}</td>
            </tr>
          </tbody>
        </table>
      </Section>
      <Section title="Prompt versions and models">
        <Json value={session.versions} />
      </Section>
    </details>
  );
}
