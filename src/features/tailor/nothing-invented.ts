// The Nothing invented check: a change survives only if its evidence can be traced
// word for word to the CV or to the user's own answers.
// Pure code with no model call, so unit tests and the live evals share it.
import type { Gap, Profile } from "@/shared/contracts";
import type { GapAnswer, ProposedChange, RejectedChange } from "./types";

export type EvidenceSources = {
  profile: Profile;
  gaps: Gap[];
  answers: GapAnswer[];
};

/** Lower case, straight quotes, single spaces, no trailing full stop. */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.;,]+$/, "");
}

/** Every line on the CV, as the user wrote it. */
export function cvLines(profile: Profile): string[] {
  return [
    profile.summary,
    ...profile.skills,
    ...profile.experience.flatMap((job) => [job.title, ...job.duties, ...job.achievements]),
    ...profile.education.flatMap((item) => [item.qualification, item.subject ?? "", item.grade ?? ""]),
    ...profile.certifications.map((item) => item.name),
  ].filter((line) => line.trim() !== "");
}

function answerLines({ profile, answers }: EvidenceSources): string[] {
  return [...profile.followUpAnswers.map((item) => item.answer), ...answers.map((item) => item.answer)];
}

/** The words of a requirement worth looking for, e.g. "Asana or Jira" gives "asana" and "jira". */
export function requirementTerms(requirement: string): string[] {
  return requirement
    .split(/\s+or\s+|,|\//i)
    .map(normalise)
    .filter((term) => term.length >= 2);
}

/** Evidence counts when it is a whole source line, or a quote of at least three words from one. */
function isQuotedFrom(evidence: string, lines: string[]): boolean {
  const quote = normalise(evidence);
  if (quote === "") return false;
  const longEnough = quote.split(" ").length >= 3;
  return lines.some((line) => {
    const source = normalise(line);
    return source === quote || (longEnough && source.includes(quote));
  });
}

/** Why a change breaks Nothing invented, or null when it is supported. */
export function unsupportedReason(change: ProposedChange, sources: EvidenceSources): string | null {
  const lines = change.evidenceSource === "cv" ? cvLines(sources.profile) : answerLines(sources);
  if (!isQuotedFrom(change.evidence, lines)) {
    return `The evidence is not a quote from the user's ${change.evidenceSource === "cv" ? "CV" : "answers"}.`;
  }

  if (change.section === "skills" && !normalise(change.evidence).includes(normalise(change.after))) {
    return "The new skill is not named in the evidence.";
  }

  const noExperience = sources.answers.filter((answer) => !answer.hasExperience);
  if (change.gapId && noExperience.some((answer) => answer.gapId === change.gapId)) {
    return "The user said they have no experience for this gap.";
  }

  const after = normalise(change.after);
  const before = normalise(change.before ?? "");
  for (const answer of noExperience) {
    const gap = sources.gaps.find((item) => item.id === answer.gapId);
    const added = gap && requirementTerms(gap.requirement).find((term) => after.includes(term) && !before.includes(term));
    if (added) {
      return `It adds "${added}", which the user said they have not done.`;
    }
  }

  return null;
}

/** Splits changes into the ones with traceable evidence and the ones removed. */
export function enforceNothingInvented(
  changes: ProposedChange[],
  sources: EvidenceSources,
): { kept: ProposedChange[]; removed: RejectedChange[] } {
  const kept: ProposedChange[] = [];
  const removed: RejectedChange[] = [];
  for (const change of changes) {
    const reason = unsupportedReason(change, sources);
    if (reason) {
      removed.push({ change, reason });
    } else {
      kept.push(change);
    }
  }
  return { kept, removed };
}
