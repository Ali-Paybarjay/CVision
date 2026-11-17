// Live prompt eval for tailor-summary (#16): real requests to the model, run with `npm run eval`. The summary opens
// with the description the user chose, stays two or three sentences, never takes the job ad's title, and adds none of
// the ad's own duties, registration or Band.
import { describe, expect, it } from "vitest";
import { summaryOptions, writeSummary, type DescribeAs } from "@/features/tailor";
import { getAiProvider } from "@/shared/ai";
import type { Job, MatchResult, Profile } from "@/shared/contracts";
import { personas } from "@/shared/sample-data";
import { unregisteredFixtures } from "./clinical-fixture";
import { adTermsAdded, suggestCases } from "./suggest-from-cv.cases";

type SummaryCase = { name: string; profile: Profile; job: Job; match: MatchResult; describeAs: DescribeAs; adOnlyTerms: string[] };

const titleOf = (profile: Profile): DescribeAs => ({ kind: "title", title: summaryOptions(profile).titles[0] });
const summaryCases: SummaryCase[] = [
  { name: "Sara, as her summary says", ...personas.sara, job: personas.sara.jobs[0], describeAs: { kind: "summary" }, adOnlyTerms: ["power bi", "nhs", "healthcare"] },
  { name: "Reza, a teacher, by his job title, for a Project Coordinator ad", ...personas.reza, job: personas.reza.jobs[0], describeAs: titleOf(personas.reza.profile), adOnlyTerms: [] },
  { name: "Daniel, a store manager, by his job title, for an Operations Manager ad", ...personas.daniel, job: personas.daniel.jobs[0], describeAs: titleOf(personas.daniel.profile), adOnlyTerms: [] },
  // Not registered with the NMC: the Band 6 ad's registration and Band must not reach her summary (#422).
  { name: "Leah, not yet registered, for the Band 6 ad", ...unregisteredFixtures, describeAs: { kind: "summary" }, adOnlyTerms: [...suggestCases[0].adOnlyTerms, "nmc", "band 6"] },
];

const empty = { changes: [], nextSteps: [] };
const sentences = (text: string) => text.trim().split(/(?<=[.!?])\s+/).filter(Boolean);

describe.skipIf(!getAiProvider())("The professional summary (live)", () => {
  describe.each(summaryCases)("$name", ({ profile, job, match, describeAs, adOnlyTerms }) => {
    it("is written, short, opens as the user chose, and adds nothing from the ad", async () => {
      const { change, removed } = await writeSummary({ profile, job, match, describeAs, sample: empty });
      // Printed so a reviewer can read what no word list sees.
      console.log(`=== SUMMARY ${profile.fullName}\n${profile.summary}\n→ ${change?.after ?? "(none)"}`);

      expect(removed.map((item) => `${item.change.after} (${item.reason})`)).toEqual([]);
      expect(change).not.toBeNull();
      const after = change?.after ?? "";
      expect(sentences(after).length, after).toBeLessThanOrEqual(3);
      expect(after.split(/\s+/).length, after).toBeLessThanOrEqual(70);
      expect(after.toLowerCase(), after).not.toContain(job.title.toLowerCase());
      if (describeAs.kind === "title") expect(sentences(after)[0].toLowerCase(), after).toContain(describeAs.title.toLowerCase());
      expect(adTermsAdded({ before: profile.summary, after }, profile, adOnlyTerms), after).toEqual([]);
    });
  });
});
