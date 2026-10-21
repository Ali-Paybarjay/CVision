import Link from "next/link";
import { askGapQuestions, proposeChanges, sampleAnswers, sampleProposals } from "@/features/tailor";
import { personas, type PersonaName } from "@/shared/sample-data";
import { ChangeReview } from "./change-review";

// A test page on the sample personas until Profile and Jobs hand over real data: /tailor?persona=reza
export default async function TailorPage({ searchParams }: PageProps<"/tailor">) {
  const requested = (await searchParams).persona;
  const name: PersonaName = typeof requested === "string" && requested in personas ? (requested as PersonaName) : "sara";
  const { profile, jobs, match } = personas[name];
  const job = jobs[0];

  const questions = await askGapQuestions({ profile, job, match });
  const answers = sampleAnswers[name];
  const proposal = await proposeChanges({ profile, job, match, answers, sample: sampleProposals[name] });

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold">Tailor</h1>
      <p className="mt-3">Review each suggested change before it goes into your CV and cover letter.</p>

      <nav aria-label="Sample personas" className="mt-6 flex flex-wrap gap-2">
        {(Object.keys(personas) as PersonaName[]).map((key) => (
          <Link
            key={key}
            href={`/tailor?persona=${key}`}
            aria-current={key === name ? "page" : undefined}
            className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm capitalize aria-[current=page]:border-accent aria-[current=page]:text-accent"
          >
            {key}
          </Link>
        ))}
      </nav>

      <p className="mt-6 text-text-muted">
        {profile.fullName} · {job.title} at {job.company}
      </p>

      <section className="mt-8">
        <h2 className="text-xl">Your answers to the gap questions</h2>
        <ul className="mt-4 space-y-3">
          {questions.map((question) => {
            const answer = answers.find((item) => item.gapId === question.gapId);
            return (
              <li key={question.gapId} className="rounded-lg border border-line bg-surface p-4">
                <p className="font-semibold">{question.question}</p>
                <p className="mt-2 text-text-muted">{answer ? `“${answer.answer}”` : "Not answered yet."}</p>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-xl">Suggested changes</h2>
        <div className="mt-4">
          <ChangeReview changes={proposal.changes} />
        </div>
      </section>

      {proposal.nextSteps.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl">Not added to your CV</h2>
          <p className="mt-2 text-text-muted">You told us you have not done these yet, so we have not added them. Here is a real next step for each.</p>
          <ul className="mt-4 space-y-3">
            {proposal.nextSteps.map((step) => {
              const gap = match.gaps.find((item) => item.id === step.gapId);
              return (
                <li key={step.gapId} className="rounded-lg border border-line bg-warning-bg p-4 text-warning">
                  <p className="font-semibold">⚠ {gap?.requirement ?? "Gap"}</p>
                  <p className="mt-1">
                    {step.kind === "learn" ? "To learn: " : "Closest real skill: "}
                    {step.suggestion}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
