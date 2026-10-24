// Cover letter cases for the four personas: their sample answers and the changes they approved.
// The unit tests run them in mock mode; the live evals send them to the model.
import { sampleAnswers, sampleProposals, type CoverLetterInput } from "@/features/tailor";
import { personas, type PersonaName } from "@/shared/sample-data";

export const coverLetterCases = (Object.keys(personas) as PersonaName[]).map((name) => {
  const { profile, jobs, match } = personas[name];
  const input: CoverLetterInput = {
    profile,
    job: jobs[0],
    answers: sampleAnswers[name],
    changes: sampleProposals[name].changes.map((change, index) => ({
      ...change,
      id: `${name}-change-${index + 1}`,
      jobId: jobs[0].id,
      status: "approved" as const,
    })),
  };
  return { name, input, gaps: match.gaps };
});

/** Template phrases that do not sound like anyone in particular. */
export const templatePhrases = [
  "i am writing to express",
  "great fit",
  "passionate",
  "results-driven",
  "dynamic",
  "team player",
  "proven track record",
  "hit the ground running",
  "leverage",
  "synergy",
  "go-getter",
];

/** How many four-word phrases from the user's own CV lines and answers appear in the letter. */
export function ownPhrasesUsed(letter: string, input: CoverLetterInput): number {
  const clean = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}£% ]+/gu, " ").replace(/\s+/g, " ").trim();
  const sources = [
    ...input.profile.experience.flatMap((job) => [...job.duties, ...job.achievements]),
    ...input.answers.filter((answer) => answer.hasExperience).map((answer) => answer.answer),
    ...input.changes.map((change) => change.after),
  ];
  const phrases = new Set<string>();
  for (const source of sources) {
    const words = clean(source).split(" ");
    for (let i = 0; i + 4 <= words.length; i++) phrases.add(words.slice(i, i + 4).join(" "));
  }
  const text = clean(letter);
  return [...phrases].filter((phrase) => text.includes(phrase)).length;
}
