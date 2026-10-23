import "server-only";
import { z } from "zod";
import { askModel, loadPrompt, type Requester } from "@/shared/ai";
import { CvIssueSchema, type CvCheckResult } from "@/shared/contracts";

/** The model's answer. Ids and readiness are added in code, so the model cannot get them wrong. */
export const CvCheckAnswerSchema = z.object({
  score: z.number().int().min(0).max(100),
  summary: z.string().min(1),
  issues: z.array(CvIssueSchema.omit({ id: true })),
});

/** The prompt asks for at most this many; extra ones are dropped. */
export const MAX_ISSUES = 8;
export type CvCheckAnswer = z.infer<typeof CvCheckAnswerSchema>;

/** The score bands in prompts/cvcheck-review.md. */
export function readinessFor(score: number): CvCheckResult["readiness"] {
  if (score >= 80) return "ready";
  if (score >= 55) return "nearly-ready";
  return "not-ready";
}

const severityOrder = { high: 0, medium: 1, low: 2 } as const;

export function toCvCheckResult(answer: CvCheckAnswer): CvCheckResult {
  const issues = answer.issues
    .map((issue, index) => ({ issue, index }))
    // Most serious first; the model's own order breaks ties.
    .sort((a, b) => severityOrder[a.issue.severity] - severityOrder[b.issue.severity] || a.index - b.index)
    .slice(0, MAX_ISSUES)
    .map(({ issue }, index) => ({ id: `issue-${index + 1}`, ...issue }));
  return { readiness: readinessFor(answer.score), score: answer.score, summary: answer.summary, issues };
}

/**
 * Checks a CV's text for UK employers with askModel and prompts/cvcheck-review.md.
 * In mock mode no model is called and the answer is sampleAnswer. Nothing is stored.
 */
export async function checkCv(cvText: string, options: { requester?: Requester } = {}): Promise<CvCheckResult> {
  const answer = await askModel({
    feature: "cv-check",
    prompt: await loadPrompt("cvcheck-review", { cv: cvText }),
    schema: CvCheckAnswerSchema,
    sample: sampleAnswer,
    requester: options.requester,
    maxTokens: 4000,
  });
  return toCvCheckResult(answer);
}

/** The mock answer: what a typical, nearly ready CV gets. */
export const sampleAnswer: CvCheckAnswer = {
  score: 68,
  summary:
    "Your CV is nearly ready for UK employers: it is clear and well ordered. Add results to your recent jobs first, so employers can see what you achieved, not only what you did.",
  issues: [
    {
      title: "Duties, but few results",
      explanation:
        "Most lines describe what you were responsible for. UK employers shortlist on evidence of impact, such as time saved, money, people or volume.",
      fix: "For your two most recent jobs, turn two or three duties into results. If you know a figure, add it, for example how many customers or how much time.",
      severity: "high",
    },
    {
      title: "No personal profile",
      explanation: "The CV starts with your experience, so a recruiter has to work out what you offer and what job you want.",
      fix: "Add three or four lines at the top: your current role, your strongest skills and the kind of job you are looking for.",
      severity: "medium",
    },
    {
      title: "Longer than two pages",
      explanation: "Most UK employers expect two pages of A4 at most and read the first page closely.",
      fix: "Shorten jobs older than ten years to the title, employer and dates, and remove lines that repeat.",
      severity: "medium",
    },
    {
      title: "An unnecessary line at the end",
      explanation: "\"References available on request\" is assumed in the UK and takes space you could use for evidence.",
      fix: "Remove the line. Give referees' details when an employer asks for them.",
      severity: "low",
    },
  ],
};
