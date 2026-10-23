// The end-of-interview feedback report: overall score, priorities, competency map, notes, and for each answer
// what worked, what cost marks and one specific thing to do next time (prompts/_voice.md: outcome first).
import type { AnswerEvaluation, InterviewReport, InterviewSession } from "@/features/interview/contracts";
import { readinessLabels } from "@/features/interview/engine/scoring";
import { evaluationFor, followUpAnswer, followUpQuestion, mainAnswer } from "@/features/interview/engine/session";
import { technicalV1 } from "@/features/interview/rubrics";
import { Card, Notice, Status, type Tone } from "./ui";

const readinessTone: Record<InterviewReport["readiness"], Tone> = { ready: "accent", "nearly-ready": "warning", "not-yet-ready": "error" };

const competencyStatus: Record<InterviewReport["competencyMap"][number]["status"], { tone: Tone; label: string }> = {
  strong: { tone: "accent", label: "Strong" },
  adequate: { tone: "muted", label: "Adequate" },
  gap: { tone: "warning", label: "Gap" },
  "not-assessed": { tone: "muted", label: "Not assessed" },
};

const lookForStatus: Record<AnswerEvaluation["lookForEvidence"][number]["status"], { tone: Tone; label: string }> = {
  covered: { tone: "accent", label: "Covered" },
  partial: { tone: "warning", label: "Partial" },
  missing: { tone: "error", label: "Missing" },
};

export function FeedbackReport({ session }: { session: InterviewSession }) {
  const report = session.report;
  const role = session.roleProfile;
  if (!report || !role) return null;
  const position = (id: string) => session.questions.findIndex((q) => q.id === id) + 1;

  return (
    <div className="space-y-4">
      <Card>
        <p className="text-sm text-text-muted">Overall score</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <p className="text-4xl font-bold">
            {report.overall.toFixed(1)}
            <span className="text-lg font-semibold text-text-muted"> / 5</span>
          </p>
          <Status tone={readinessTone[report.readiness]}>{readinessLabels[report.readiness]}</Status>
        </div>
        <p className="mt-3">{report.verdict}</p>
        {report.levelGapNote && (
          <div className="mt-3">
            <Notice tone="warning">
              <strong>Level: </strong>
              {report.levelGapNote}
            </Notice>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="text-xl">Prepare these three things</h2>
        <ol className="mt-3 list-decimal space-y-3 pl-5">
          {report.priorities.map((priority) => (
            <li key={priority.title}>
              <p className="font-semibold">{priority.title}</p>
              <p className="text-text-muted">{priority.detail}</p>
            </li>
          ))}
        </ol>
      </Card>

      <Card>
        <h2 className="text-xl">Competency map</h2>
        <ul className="mt-3 divide-y divide-line">
          {report.competencyMap.map((entry) => {
            const competency = role.competencies.find((c) => c.id === entry.competencyId);
            const status = competencyStatus[entry.status];
            return (
              <li key={entry.competencyId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {competency?.name}
                  <span className="text-sm text-text-muted"> · {competency?.priority}</span>
                </span>
                <span className="flex items-center gap-2 text-sm text-text-muted">
                  {entry.questionIds.length > 0 && <span>Question {entry.questionIds.map(position).join(", ")}</span>}
                  <Status tone={status.tone}>{status.label}</Status>
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      {report.uncertaintyNotes.length > 0 && (
        <Card>
          <h2 className="text-xl">Check these points with a practitioner</h2>
          <div className="mt-3 space-y-2">
            {report.uncertaintyNotes.map((note) => (
              <Notice key={note.questionId} tone="warning">
                <strong>Question {position(note.questionId)}: </strong>
                {note.note}
              </Notice>
            ))}
          </div>
        </Card>
      )}

      <h2 className="pt-2 text-xl">Question by question</h2>
      {session.questions.map((question, index) => {
        const evaluation = evaluationFor(session, question.id);
        if (!evaluation) return null;
        return (
          <QuestionCard
            key={question.id}
            number={index + 1}
            text={question.text}
            lookFors={question.lookFors ?? []}
            evaluation={evaluation}
            answer={mainAnswer(session, question.id)}
            followUp={followUpQuestion(session, question.id)}
            followUpAnswer={followUpAnswer(session, question.id)}
          />
        );
      })}
    </div>
  );
}

function QuestionCard(props: {
  number: number;
  text: string;
  lookFors: { id: string; text: string }[];
  evaluation: AnswerEvaluation;
  answer: string | null;
  followUp: string | null;
  followUpAnswer: string | null;
}) {
  const { evaluation } = props;
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold">
          {props.number}. {props.text}
        </h3>
        <p className="shrink-0 text-2xl font-bold">
          {evaluation.overall.toFixed(1)}
          <span className="sr-only"> out of 5</span>
        </p>
      </div>

      <AnswerFeedback evaluation={evaluation} />

      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {technicalV1.dimensions.map((dimension) => (
          <div key={dimension.key} className="rounded-md bg-canvas p-2">
            <dt className="text-xs text-text-muted">{dimension.label}</dt>
            <dd className="text-lg font-semibold">{evaluation.scores[dimension.key as keyof AnswerEvaluation["scores"]]} / 5</dd>
          </div>
        ))}
      </dl>

      {evaluation.accuracyConfidence === "low" && (
        <div className="mt-3">
          <Notice tone="warning">The accuracy of this answer could not be judged with confidence.</Notice>
        </div>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <h4 className="text-sm text-text-muted">What a strong answer covers</h4>
          <ul className="mt-2 space-y-2">
            {evaluation.lookForEvidence.map((entry) => {
              const lookFor = props.lookFors.find((l) => l.id === entry.lookForId);
              const status = lookForStatus[entry.status];
              return (
                <li key={entry.lookForId} className="text-sm">
                  <Status tone={status.tone}>{status.label}</Status> {lookFor?.text}
                  {entry.quote && <q className="mt-1 block border-l-2 border-fit-bar bg-fit px-2 py-1 italic">{entry.quote}</q>}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="space-y-3 text-sm">
          <FeedbackList title="Outline of a stronger answer" items={evaluation.strongerAnswerOutline} />
          {evaluation.followUpClosedGap !== undefined && (
            <p>
              <Status tone={evaluation.followUpClosedGap ? "accent" : "warning"}>
                {evaluation.followUpClosedGap ? "Follow-up closed the gap" : "Follow-up did not close the gap"}
              </Status>
            </p>
          )}
        </div>
      </div>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-accent">Your answer</summary>
        <p className="mt-2 whitespace-pre-wrap">{props.answer}</p>
        {props.followUp && (
          <>
            <p className="mt-3 font-semibold">{props.followUp}</p>
            <p className="mt-1 whitespace-pre-wrap">{props.followUpAnswer}</p>
          </>
        )}
        <h4 className="mt-3 text-text-muted">Why these scores</h4>
        <ul className="mt-1 list-disc pl-5">
          {technicalV1.dimensions.map((dimension) => (
            <li key={dimension.key}>
              <strong>{dimension.label}:</strong> {evaluation.justifications[dimension.key as keyof AnswerEvaluation["justifications"]]}
            </li>
          ))}
        </ul>
      </details>
    </Card>
  );
}

/** Outcome first: what worked, what cost marks, and the one thing to do next time. */
function AnswerFeedback({ evaluation }: { evaluation: AnswerEvaluation }) {
  const costMarks = [...evaluation.weaknesses, ...evaluation.errors.map((e) => `${e.claim} Correction: ${e.correction}`)];
  return (
    <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
      {evaluation.strengths.length > 0 ? (
        <FeedbackList title="What worked" items={evaluation.strengths} />
      ) : (
        <div>
          <h4 className="text-text-muted">What worked</h4>
          <p className="mt-1">Nothing in this answer earned credit yet. Build it from the outline below.</p>
        </div>
      )}
      <FeedbackList title="What cost you marks" items={costMarks} />
      <div className="rounded-md border-l-4 border-fit-bar bg-fit p-3 sm:col-span-2">
        <h4 className="font-semibold text-accent">Do this next time</h4>
        <p className="mt-1">{evaluation.improvement}</p>
      </div>
    </div>
  );
}

function FeedbackList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h4 className="text-text-muted">{title}</h4>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
