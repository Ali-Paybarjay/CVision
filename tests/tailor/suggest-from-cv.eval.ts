// Live prompt eval for tailor-suggest (#417): real requests to the model, run with `npm run eval`. Suggestions made from
// the CV alone see the whole ad (#407), so they must not add the ad's own duties to a line of the user's.
import { describe, expect, it } from "vitest";
import { suggestFromCv } from "@/features/tailor";
import { getAiProvider } from "@/shared/ai";
import { adTermsAdded, suggestCases } from "./suggest-from-cv.cases";

const empty = { changes: [], nextSteps: [] };

describe.skipIf(!getAiProvider())("Suggestions from the CV (live)", () => {
  describe.each(suggestCases)("$name", ({ profile, job, match, adOnlyTerms }) => {
    it("need nothing taken out by the Nothing invented check, and add none of the ad's own duties", async () => {
      const proposal = await suggestFromCv({ profile, job, match, sample: empty });
      // Printed so a reviewer can read what no word list sees.
      for (const change of proposal.changes) console.log(`=== SUGGESTION ${profile.fullName}\n${change.before ?? "(new)"}\n→ ${change.after}`);

      expect((proposal.removed ?? []).map((item) => `${item.change.after} (${item.reason})`)).toEqual([]);
      for (const change of proposal.changes) expect(adTermsAdded(change, profile, adOnlyTerms), change.after).toEqual([]);
    });
  });
});
