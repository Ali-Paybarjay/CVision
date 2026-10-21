import Link from "next/link";
import { askGapQuestions, proposeChanges, sampleAnswers, sampleProposals } from "@/features/tailor";
import { personas, type PersonaName } from "@/shared/sample-data";
import { Card, Notice, Page } from "@/shared/ui";
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
    <Page
      width="wide"
      title="Tailor"
      description="Review each suggested change before it goes into your CV and cover letter."
    >
      <nav aria-label="Sample personas" className="flex flex-wrap gap-2">
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

      <p className="text-text-muted">
        {profile.fullName} · {job.title} at {job.company} ·{" "}
        <span className="rounded-full border border-line px-2 py-0.5 text-xs">Sample data · mock mode</span>
      </p>

      <section>
        <h2 className="text-xl">Your answers to the gap questions</h2>
        <ul className="mt-4 space-y-3">
          {questions.map((question) => {
            const answer = answers.find((item) => item.gapId === question.gapId);
            return (
              <li key={question.gapId}>
                <Card>
                  <p className="font-semibold">{question.question}</p>
                  <p className="mt-2 text-text-muted">{answer ? `“${answer.answer}”` : "Not answered yet."}</p>
                </Card>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2 className="text-xl">Suggested changes</h2>
        <div className="mt-4">
          <ChangeReview changes={proposal.changes} />
        </div>
      </section>

      {proposal.nextSteps.length > 0 && (
        <section>
          <h2 className="text-xl">Not added to your CV</h2>
          <p className="mt-2 text-text-muted">You told us you have not done these yet, so we have not added them. Here is a real next step for each.</p>
          <ul className="mt-4 space-y-3">
            {proposal.nextSteps.map((step) => {
              const gap = match.gaps.find((item) => item.id === step.gapId);
              return (
                <li key={step.gapId}>
                  <Notice tone="info" title={gap?.requirement ?? "Gap"}>
                    {step.kind === "learn" ? "To learn: " : "Closest real skill: "}
                    {step.suggestion}
                  </Notice>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </Page>
  );
}
