import { finalCheck, type FinalCheckId } from "@/features/tailor/final-check";
import type { TailoredCv } from "@/features/tailor/tailored-cv";
import { Button, CheckIcon, WarningIcon } from "@/shared/ui";

const copy: Record<FinalCheckId, { ok: string; problem: string }> = {
  "first-person": { ok: "No “I”, “my” or “me”", problem: "These lines use “I”, “my” or “me”. A UK CV leaves them out:" },
  "duty-lines": { ok: "Every line says what you did", problem: "These lines say what the job was, not what you did:" },
  repeats: { ok: "No line appears twice", problem: "These lines appear more than once:" },
  "us-spelling": { ok: "UK spelling", problem: "These look like US spelling. Use the UK form, unless it is part of a name:" },
};

/**
 * The final check above the downloads (Tailor v2 review, 12 November): plain rules on the CV as it will download, so
 * the user can fix what a recruiter would notice. It never blocks the download.
 */
export function FinalCheck({ cv, onReview }: { cv: TailoredCv; onReview: () => void }) {
  const items = finalCheck(cv);
  const problems = items.filter((item) => item.found.length > 0).length;

  return (
    <section aria-labelledby="final-check-heading" className="flex flex-col gap-3 rounded-md border border-line p-4">
      <h4 id="final-check-heading" className="font-semibold">
        Final check
      </h4>
      <p className="text-sm text-text-muted">
        {problems === 0
          ? "We read your CV the way a UK recruiter would. It passed every check."
          : `We read your CV the way a UK recruiter would. ${problems === 1 ? "One thing" : `${problems} things`} to look at before you send it. You can still download it now.`}
      </p>
      <ul className="flex flex-col gap-3 text-sm">
        {items.map((item) =>
          item.found.length === 0 ? (
            <li key={item.id} className="flex gap-2">
              <CheckIcon className="mt-0.5 size-5 shrink-0 text-accent" />
              <span>{copy[item.id].ok}</span>
            </li>
          ) : (
            <li key={item.id} className="flex gap-2">
              <WarningIcon className="mt-0.5 size-5 shrink-0 text-warning" />
              <div className="min-w-0">
                <p>{copy[item.id].problem}</p>
                <ul className="mt-1 flex flex-col gap-1 text-text-muted">
                  {item.found.map((text, index) => (
                    <li key={index} className="break-words">
                      “{text}”
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ),
        )}
      </ul>
      {problems > 0 && (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          {/* No link to Profile here: leaving the page would lose the cover letter and the answers, which only this page holds. */}
          <p className="text-sm text-text-muted">
            A suggested line can be edited or rejected in step 3. A line from your own CV changes in your profile, after you download.
          </p>
          <div>
            <Button onClick={onReview}>Back to your changes</Button>
          </div>
        </div>
      )}
    </section>
  );
}
