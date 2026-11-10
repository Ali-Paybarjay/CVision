// Cases for the live eval of tailor-suggest (#417): words the ad uses for work that is not on the CV. A suggestion made
// from the CV alone must not add one to a user's line. The check only looks for whole requirements of missing gaps, so
// these are measured by the eval, not removed by code.
import { cvLines } from "@/features/tailor/nothing-invented";
import type { ProposedChange } from "@/features/tailor/types";
import type { Job, MatchResult, Profile } from "@/shared/contracts";
import { personas } from "@/shared/sample-data";
import { clinicalFixtures } from "./clinical-fixture";

export type SuggestCase = { name: string; profile: Profile; job: Job; match: MatchResult; adOnlyTerms: string[] };

export const suggestCases: SuggestCase[] = [
  {
    name: "Leah and the Band 6 acute medicine ad",
    ...clinicalFixtures,
    // "allocat" catches allocate and allocation.
    adOnlyTerms: ["sepsis", "outreach", "take charge", "allocat", "practice assessor", "student", "safeguard", "incident", "audit", "triage", "same day emergency care"],
  },
  { name: "Sara and her first job", profile: personas.sara.profile, job: personas.sara.jobs[0], match: personas.sara.match, adOnlyTerms: ["power bi", "nhs", "healthcare"] },
];

/** The terms of the list that a change adds: in its new text, but not in the line it rewrites nor anywhere on the CV. */
export function adTermsAdded(change: Pick<ProposedChange, "before" | "after">, profile: Profile, terms: string[]): string[] {
  const after = change.after.toLowerCase();
  const known = [change.before ?? "", ...cvLines(profile)].join("\n").toLowerCase();
  return terms.filter((term) => after.includes(term) && !known.includes(term));
}
