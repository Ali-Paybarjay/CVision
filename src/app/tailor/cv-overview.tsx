import type { TailoredCv } from "@/features/tailor/tailored-cv";
import type { TailoringChange } from "@/shared/contracts";
import { Button } from "@/shared/ui";
import { CvPreview } from "./cv-preview";

const floating = "flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 text-sm shadow-lg";

type CvOverviewProps = {
  cv: TailoredCv;
  /** The row of steps across the top. */
  tracker: React.ReactNode;
  /** The next question without an answer, if any. */
  nextQuestion: string | null;
  /** The first suggestion still waiting for the user's decision, if any. */
  suggestion: TailoringChange | null;
  onAnswer: () => void;
  onReview: () => void;
};

/**
 * The picture of the application above the steps: the CV as it stands, with the next question and the next suggestion
 * beside it. Everything here comes from the user's own data; nothing is decided here, only in the steps below.
 */
export function CvOverview({ cv, tracker, nextQuestion, suggestion, onAnswer, onReview }: CvOverviewProps) {
  return (
    <section aria-label="Your CV at a glance" className="flex flex-col gap-6 rounded-lg bg-fit p-4 sm:p-8">
      <div className="rounded-lg bg-surface px-2 py-3 shadow-lg">{tracker}</div>

      <div className="grid items-center gap-4 lg:grid-cols-[17rem_minmax(0,1fr)_19rem]">
        <div className={`${floating} lg:z-10 lg:-mr-10`}>
          <p className="font-semibold text-accent">Your next question</p>
          {nextQuestion ? (
            <>
              <p>{nextQuestion}</p>
              <div>
                <Button variant="quiet" onClick={onAnswer} className="min-h-11 px-0">
                  Answer this question
                </Button>
              </div>
            </>
          ) : (
            <p className="text-text-muted">You have answered every question.</p>
          )}
        </div>

        {/* A picture of the CV: the full preview people can read and check is in step 3. */}
        <div aria-hidden="true" inert className="pointer-events-none relative max-h-96 overflow-hidden rounded-sm lg:max-h-[30rem]">
          <CvPreview cv={cv} />
          <div className="absolute inset-x-0 bottom-0 h-20 bg-linear-to-t from-cv-paper to-transparent" />
        </div>

        <div className="flex flex-col gap-4 lg:z-10 lg:-ml-10">
          <div className={floating}>
            <p className="font-semibold text-accent">Suggested for this job</p>
            {suggestion ? (
              <>
                {suggestion.before && (
                  <p className="flex gap-2 text-text-muted">
                    <span aria-hidden="true" className="text-error">✕</span>
                    <span>
                      <span className="sr-only">Now: </span>
                      {suggestion.before}
                    </span>
                  </p>
                )}
                <p className="flex gap-2">
                  <span aria-hidden="true" className="text-accent">✓</span>
                  <span>
                    <span className="sr-only">Suggested: </span>
                    {suggestion.after}
                  </span>
                </p>
                <div>
                  <Button variant="quiet" onClick={onReview} className="min-h-11 px-0">
                    Review suggestions
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-text-muted">No suggestion is waiting for your decision.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
