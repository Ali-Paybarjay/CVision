import { describe, expect, it } from "vitest";
import { getAiProvider } from "@/shared/ai";
import { JobSchema, ProfileSchema, type MatchResult, type Profile } from "@/shared/contracts";
import { personas } from "@/shared/sample-data";
import { askGapQuestions } from "@/features/tailor/gap-questions";
import processJob from "../../../../sample-data/process-engineer/job.json";
import processProfile from "../../../../sample-data/process-engineer/profile.json";
import { profileEvidenceLines } from "../match";
import { matchJob } from "./check-job";

// Prompt evals for #188's decision 3B: a gap the profile partly shows quotes up to three of its lines. Real requests
// to the model, so they cost money: run with `npm run eval` or from Actions → eval. Its own file, so it doesn't meet
// the changes to check-job.eval.ts in #222.

/** The gaps with the lines they quote, for the before and after in the PR. */
function logGaps(label: string, match: MatchResult) {
  const gaps = match.gaps.map((gap) => `[${gap.importance} ${gap.kind}] ${gap.requirement}${gap.evidence ? ` ← ${JSON.stringify(gap.evidence)}` : ""}`);
  console.log(`${label}: score ${match.score}\n  ${gaps.join("\n  ")}`);
}

/** Every quote is a real profile line, at most three per gap, and a missing gap quotes nothing. */
function expectQuotesFromProfile(match: MatchResult, profile: Profile) {
  const texts = profileEvidenceLines(profile).map((line) => line.text);
  for (const gap of match.gaps) {
    if (gap.kind === "missing") expect(gap.evidence, gap.requirement).toBeUndefined();
    expect((gap.evidence ?? []).length, gap.requirement).toBeLessThanOrEqual(3);
    for (const line of gap.evidence ?? []) expect(texts, gap.requirement).toContain(line);
  }
}

describe.skipIf(!getAiProvider())("profile-match: the lines behind a partly shown gap (#188)", () => {
  it("quotes the process engineer's profile under the requirements it partly shows", async () => {
    const profile = ProfileSchema.parse(processProfile);
    const { match } = await matchJob(profile, JobSchema.parse(processJob));
    logGaps("Process engineer", match);

    expectQuotesFromProfile(match, profile);
    // Both have a line that points towards them ("Led and mentored small teams…", "Took part in the… HAZOP study").
    const partly = ["Leading teams to deliver to programme and budget", "Acting as the process designer in HAZOP studies"];
    const quoted = match.gaps.filter((gap) => partly.includes(gap.requirement) && (gap.evidence ?? []).length > 0);
    expect(quoted.length, "a partly shown requirement with its profile line").toBeGreaterThan(0);
  });

  it("asks Sara's Tailor questions with and without the quoted lines (the before and after for the PR)", async () => {
    const { profile, jobs } = personas.sara;
    const job = jobs[1];
    const { match } = await matchJob(profile, job);
    logGaps("Sara, job 2", match);
    expectQuotesFromProfile(match, profile);

    const withLines = await askGapQuestions({ profile, job, match });
    const without = await askGapQuestions({
      profile,
      job,
      // The prompt gets the gaps as JSON, where an undefined field is left out: the gaps as they were before #188.
      match: { ...match, gaps: match.gaps.map((gap) => ({ ...gap, evidence: undefined })) },
    });
    const show = (questions: typeof withLines) => questions.map((item) => `${item.gapId}: ${item.question}`).join("\n  ");
    console.log(`Sara, job 2, Tailor questions before (no lines):\n  ${show(without)}`);
    console.log(`Sara, job 2, Tailor questions after (with lines):\n  ${show(withLines)}`);
    expect(withLines.length).toBeGreaterThan(0);
    expect(without.length).toBeGreaterThan(0);
  });
});
