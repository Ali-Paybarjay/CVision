// The end-of-interview feedback report: overall score, priorities, competency map, notes, and for each answer
// what worked, what cost marks and one specific thing to do next time (prompts/_voice.md: outcome first). After
// "End here" (#205), answered questions keep the same cards and every other question shows a suggested answer.
import type { AnswerEvaluation, AnswerSuggestion, InterviewReport, InterviewSession, TechnicalInterviewQuestion } from "@/features/interview/contracts";
import { readinessLabels, sessionOverall } from "@/features/interview/engine/scoring";
import {
  evaluationFor,
  followUpAnswer,
  followUpQuestion,
  mainAnswer,
  reportQuestionIds,
  suggestionFor,
  technicalQuestions,
} from "@/features/interview/engine/session";
import { technicalV1 } from "@/features/interview/rubrics";
import { Card, Notice } from "@/shared/ui";
import { Status, type Tone } from "./ui";

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
  if (session.endedAt) return <EndedReport session={session} />;
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
            <Notice tone="warning" title="Level">
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
              <Notice key={note.questionId} tone="warning" title={`Question ${position(note.questionId)}`}>
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

/**
 * The report after "End here" (#205). No model-written summary: the score is the code's average of the answered
 * questions only, and with no answers the CV summary quotes the analysis word for word.
 */
function EndedReport({ session }: { session: InterviewSession }) {
  const answeredIds = reportQuestionIds(session);
  const evaluations = answeredIds.flatMap((id) => evaluationFor(session, id) ?? []);
  const total = session.questions.length;

  return (
    <div className="space-y-4">
      <Card>
        {evaluations.length > 0 ? (
          <>
            <p className="text-sm text-text-muted">
              Based on the {answeredIds.length} of {total} questions you answered
            </p>
            <p className="mt-1 text-4xl font-bold">
              {sessionOverall(evaluations).toFixed(1)}
              <span className="text-lg font-semibold text-text-muted"> / 5</span>
            </p>
            <p className="mt-3">You ended the practice early. Your answers are scored below, and every other question has a suggested answer built from your CV.</p>
          </>
        ) : (
          <>
            <h2 className="text-xl">Suggested answers from your CV</h2>
            <p className="mt-2">You ended before answering, so there is no score. Every question below has a suggested answer built from your CV.</p>
          </>
        )}
      </Card>

      {evaluations.length === 0 && <FromYourCv session={session} />}

      <h2 className="pt-2 text-xl">Question by question</h2>
      {technicalQuestions(session).map((question, index) => {
        const suggestion = suggestionFor(session, question.id);
        if (suggestion) return <SuggestionCard key={question.id} number={index + 1} question={question} suggestion={suggestion} />;
        const evaluation = evaluationFor(session, question.id);
        if (!evaluation) return null;
        return (
          <QuestionCard
            key={question.id}
            number={index + 1}
            text={question.text}
            lookFors={question.lookFors}
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

/** With no answers to score: where the CV is strongest and what they are likely to ask about, quoted from the analysis. */
function FromYourCv({ session }: { session: InterviewSession }) {
  const role = session.roleProfile;
  const candidate = session.candidateProfile;
  if (!role || !candidate) return null;
  const competency = (id: string) => role.competencies.find((c) => c.id === id);
  const gapIds = new Set(candidate.gaps.map((g) => g.competencyId));
  // A competency the analysis calls a gap is never also shown as a strength, even when the CV mentions it.
  const strongest = candidate.evidence
    .flatMap((e) => {
      const found = competency(e.competencyId);
      return e.cvQuote && found && !gapIds.has(e.competencyId) ? [{ id: found.id, name: found.name, quote: e.cvQuote, mustHave: found.priority === "must-have" }] : [];
    })
    .sort((a, b) => Number(b.mustHave) - Number(a.mustHave))
    .slice(0, 3);
  const gaps = candidate.gaps.flatMap((g) => competency(g.competencyId) ?? []);
  const claims = candidate.claimsToProbe.slice(0, 3);

  return (
    <Card>
      <h2 className="text-xl">From your CV</h2>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        {strongest.length > 0 && (
          <div>
            <h3 className="text-sm text-text-muted">Where your CV is strongest</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {strongest.map((entry) => (
                <li key={entry.id}>
                  <span className="font-semibold">{entry.name}</span>
                  <q className="mt-1 block border-l-2 border-fit-bar bg-fit px-2 py-1 italic">{entry.quote}</q>
                </li>
              ))}
            </ul>
          </div>
        )}
        {(gaps.length > 0 || claims.length > 0) && (
          <div>
            <h3 className="text-sm text-text-muted">Where they&apos;re likely to probe</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {gaps.map((gap) => (
                <li key={gap.id}>
                  <span className="font-semibold">{gap.name}</span>: the job asks for it and your CV shows little of it.
                </li>
              ))}
              {claims.map((claim) => (
                <li key={claim.id}>
                  Be ready to back this up: <q className="italic">{claim.quote}</q>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

/** Splits a sample answer so each [placeholder] can be highlighted for the candidate to replace. */
export function placeholderParts(text: string): { text: string; placeholder: boolean }[] {
  return text
    .split(/(\[[^\]]+\])/)
    .filter(Boolean)
    .map((part) => ({ text: part, placeholder: /^\[[^\]]+\]$/.test(part) }));
}

/** An unanswered question after "End here": what to cover, the CV lines behind it and a suggested answer. */
function SuggestionCard({ number, question, suggestion }: { number: number; question: TechnicalInterviewQuestion; suggestion: AnswerSuggestion }) {
  const lookFor = (id: string) => question.lookFors.find((l) => l.id === id)?.text;
  const followUp = (id: string) => question.followUps.find((f) => f.id === id)?.text;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="font-semibold">
          {number}. {question.text}
        </h3>
        <Status tone="muted">Not answered</Status>
      </div>

      {suggestion.fallback && (
        <div className="mt-3">
          <Notice tone="info">We couldn&apos;t write a suggested answer we could check against your CV. Build yours from these points.</Notice>
        </div>
      )}

      {suggestion.honestLine && (
        <div className="mt-3">
          <Notice tone="warning" title="Your CV doesn't show this yet.">
            If you have done this, use your own example. If not, say it plainly: “{suggestion.honestLine}”
          </Notice>
        </div>
      )}

      <h4 className="mt-4 text-sm text-text-muted">What to cover</h4>
      <ul className="mt-2 space-y-3 text-sm">
        {suggestion.points.map((point) => (
          <li key={point.lookForId}>
            {!suggestion.fallback && <p className="font-semibold">{lookFor(point.lookForId)}</p>}
            <p>{point.text}</p>
            {point.evidence.map((line) => (
              <p key={line} className="mt-1 border-l-2 border-fit-bar bg-fit px-2 py-1">
                From your CV: <q className="italic">{line}</q>
              </p>
            ))}
          </li>
        ))}
      </ul>

      {suggestion.sampleAnswer && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-accent">Read a suggested answer</summary>
          <p className="mt-2 whitespace-pre-wrap">
            {placeholderParts(suggestion.sampleAnswer).map((part, i) =>
              part.placeholder ? (
                <mark key={i} className="rounded bg-warning-bg px-1 text-warning">
                  {part.text}
                </mark>
              ) : (
                part.text
              ),
            )}
          </p>
          <p className="mt-2 text-text-muted">
            {placeholderParts(suggestion.sampleAnswer).some((part) => part.placeholder)
              ? "Swap each highlighted part for your own detail, and leave out anything that isn't true."
              : "Say it in your own words, and leave out anything that isn't true."}
          </p>
        </details>
      )}

      {suggestion.followUpTips.length > 0 && (
        <div className="mt-4 text-sm">
          <h4 className="text-text-muted">If they follow up</h4>
          <ul className="mt-2 space-y-2">
            {suggestion.followUpTips.map((tip) => (
              <li key={tip.followUpId}>
                <p className="font-semibold">{followUp(tip.followUpId)}</p>
                <p>{tip.tip}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {suggestion.uncertainty && (
        <div className="mt-3">
          <Notice tone="warning" title="Check this with a practitioner.">
            {suggestion.uncertainty}
          </Notice>
        </div>
      )}
    </Card>
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
