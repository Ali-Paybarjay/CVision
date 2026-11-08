// Live prompt eval for the job's role (#422): real requests to the model, run with `npm run eval`.
// The ad wants an NMC registered Band 6 nurse. Neither the CV suggestions nor the letter may claim what the user has not said.
import { describe, expect, it } from "vitest";
import { askForProposal, coverLetterText, roleClaimAdded, suggestFromCv, unsupportedReason, writeCoverLetter } from "@/features/tailor";
import type { GapAnswer } from "@/features/tailor/types";
import { getAiProvider } from "@/shared/ai";
import { clinicalFixtures, unregisteredFixtures } from "./clinical-fixture";

const empty = { changes: [], nextSteps: [] };
// "I am a Band 6 nurse", "my NMC registration": claims, not the post's title.
const band6Claim = /\b(i am|i'm|as|currently)\s+an?\s+band\s*6\b|\bmy band\s*6\b/i;
const nmcClaim = /\b(i am|i'm|as)\s+an?\s+(nmc[- ]registered|registered nurse)\b|\bmy (current )?nmc (registration|pin)\b|\bregistered with the nmc\b/i;

const cases: { name: string; fixtures: typeof clinicalFixtures; answers: GapAnswer[]; claims: RegExp[] }[] = [
  { name: "Leah, NMC registered at Band 5", fixtures: clinicalFixtures, answers: [], claims: [band6Claim] },
  { name: "Leah without NMC registration", fixtures: unregisteredFixtures, answers: unregisteredFixtures.answers, claims: [band6Claim, nmcClaim] },
];

describe.skipIf(!getAiProvider())("The job's role is never claimed (live)", () => {
  describe.each(cases)("$name", ({ fixtures, answers, claims }) => {
    const { profile, job, match } = fixtures;
    const sources = { profile, gaps: match.gaps, answers, role: job.role };

    it("tailor-propose adds no registration or Band the user has not given", async () => {
      const proposal = await askForProposal({ profile, job, match, answers, sample: empty });
      for (const change of proposal.changes) {
        expect(roleClaimAdded(change, sources), change.after).toBeNull();
        expect(unsupportedReason(change, sources), change.after).toBeNull();
      }
    });

    it("tailor-suggest asks for nothing the check has to take out for the role", async () => {
      const proposal = await suggestFromCv({ profile, job, match, sample: empty });
      const forRole = (proposal.removed ?? []).filter((item) => item.reason.includes("only the job ad says"));
      expect(forRole.map((item) => item.change.after)).toEqual([]);
    });

    it("the cover letter names the post but claims neither", async () => {
      const text = coverLetterText(await writeCoverLetter({ profile, job, changes: [], answers }), profile.fullName);
      for (const claim of claims) expect(text).not.toMatch(claim);
    });
  });
});
