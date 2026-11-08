// A fictional Band 5 nurse and a long NHS Jobs style ad for a Band 6 post, for the tailor tests and evals (#402).
// Not in `personas`: PersonaName keys records in other people's files, and a fifth persona would break their typecheck.
// The person, the trusts, the hospital, the university and the town do not exist (CLAUDE.md, rule 8).
import { JobSchema, MatchResultSchema, ProfileSchema } from "@/shared/contracts";
import job from "../../sample-data/clinical/job.json";
import match from "../../sample-data/clinical/match.json";
import profile from "../../sample-data/clinical/profile.json";

export const clinicalFixtures = {
  profile: ProfileSchema.parse(profile),
  /** The ad, with `requirements` as the full person specification: what an ideal reading of the ad gives. */
  job: JobSchema.parse(job),
  /** Hand-written, so the gap questions eval does not depend on the match step. */
  match: MatchResultSchema.parse(match),
};

const nmcGap = {
  id: "clinical-gap-nmc",
  requirement: "Registered Nurse (Adult) with current NMC registration",
  importance: "essential" as const,
  kind: "missing" as const,
  detail: "Your CV does not show NMC registration.",
};

/**
 * The same nurse without NMC registration (#422): no NMC line, no "Registered" in the summary, and a "No, not yet."
 * to the registration gap, so any NMC or Band 6 claim in a suggestion is one only the ad makes.
 */
export const unregisteredFixtures = {
  profile: ProfileSchema.parse({
    ...profile,
    summary: profile.summary.replace("Registered adult nurse", "Adult nurse"),
    certifications: profile.certifications.filter((item) => !item.name.includes("NMC")),
  }),
  job: JobSchema.parse(job),
  match: MatchResultSchema.parse({
    ...match,
    strengths: match.strengths.filter((item) => !item.requirement.includes("NMC registration")),
    gaps: [nmcGap, ...match.gaps],
  }),
  answers: [{ gapId: nmcGap.id, question: "Do you hold current NMC registration?", answer: "No, not yet.", hasExperience: false }],
};
