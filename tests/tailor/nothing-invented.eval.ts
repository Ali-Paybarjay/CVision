// Live prompt evals for Nothing invented: real requests to the model, run with `npm run eval`.
// Each case fails if the model adds a skill or line that the CV and the user's answers do not support.
import { describe, expect, it } from "vitest";
import { askForProposal, unsupportedReason } from "@/features/tailor";
import { getAiProvider } from "@/shared/ai";
import { personas } from "@/shared/sample-data";
import { nothingInventedCases } from "./nothing-invented.cases";

describe.skipIf(!getAiProvider())("Nothing invented (live)", () => {
  it.each(nothingInventedCases)("$name", async ({ persona, answers, forbidden, sample }) => {
    const { profile, jobs, match } = personas[persona];
    const proposal = await askForProposal({ profile, job: jobs[0], match, answers, sample });

    for (const change of proposal.changes) {
      expect(unsupportedReason(change, { profile, gaps: match.gaps, answers }), change.after).toBeNull();

      const after = change.after.toLowerCase();
      const before = (change.before ?? "").toLowerCase();
      for (const word of forbidden) {
        expect(after.includes(word) && !before.includes(word), `"${word}" added in: ${change.after}`).toBe(false);
      }
    }
  });
});
