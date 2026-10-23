"use server";

import { after } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/features/account/current-user";
import { track } from "@/shared/analytics/track";
import { getAnonymousKey } from "@/shared/ai/anonymous-key";
import { TailoringChangeSchema, type TailoringChange } from "@/shared/contracts";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { findBrandProblems, type BrandProblem } from "./brand-check";
import { coverLetterText, inventedTerms, writeCoverLetter } from "./cover-letter";
import { defaultGapQuestion } from "./gap-questions";
import { proposeChanges } from "./propose-changes";
import { sampleForGap } from "./samples";
import { modelFailureMessage, tailorModelAccess } from "./server/model-access";
import { getMyJob, getMyMatch, getMyProfile } from "./server/my-data";
import { fitsCv } from "./tailored-cv";
import type { GapAnswer, NextStep } from "./types";

// Anyone can call a Server Action, so every input is checked before use.
const EarlierAnswerSchema = z.object({
  gapId: z.string().min(1).max(100),
  answer: z.string().max(2000),
  hasExperience: z.boolean(),
});

const AnswerGapSchema = z.object({
  jobId: z.string().min(1).max(100),
  gapId: z.string().min(1).max(100),
  answer: z.string().max(2000),
  hasExperience: z.boolean(),
  /** The user's answers to the job's other gaps, so a "no" there still counts here (Nothing invented). */
  earlierAnswers: z.array(EarlierAnswerSchema).max(30).optional(),
});
export type AnswerGapInput = z.infer<typeof AnswerGapSchema>;

export type AnswerGapResult =
  | { ok: true; changes: TailoringChange[]; nextSteps: NextStep[]; removed: number }
  | { ok: false; message: string };

/**
 * Turns the user's answer to one gap question into suggested changes. Every change starts as "proposed"
 * and has passed the Nothing invented check; a "no" answer never changes the CV and gets a next step instead.
 */
export async function answerGap(input: AnswerGapInput): Promise<AnswerGapResult> {
  const parsed = AnswerGapSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "We could not read your answer. Try again." };
  const { jobId, gapId, hasExperience } = parsed.data;
  const answer = parsed.data.answer.trim();
  if (hasExperience && answer === "") return { ok: false, message: "Write your answer first, or choose “I haven’t done this”." };

  const access = await tailorModelAccess();
  if (!access.allowed) return { ok: false, message: access.message };

  const [profile, job, match] = await Promise.all([getMyProfile({ jobId }), getMyJob(jobId), getMyMatch(jobId)]);
  const gap = match?.gaps.find((item) => item.id === gapId);
  if (!profile || !job || !match || !gap) return { ok: false, message: "We could not find this job. Open it again from your jobs." };

  // Only answers to this job's real gaps count; the current gap's answer is the one just sent.
  const earlier: GapAnswer[] = (parsed.data.earlierAnswers ?? []).flatMap((item) => {
    const other = match.gaps.find((candidate) => candidate.id === item.gapId);
    if (!other || other.id === gapId) return [];
    const text = item.answer.trim() || "I haven't done this.";
    return [{ gapId: other.id, question: defaultGapQuestion(other).question, answer: text, hasExperience: item.hasExperience }];
  });

  try {
    const result = await proposeChanges({
      profile,
      job,
      match: { ...match, gaps: [gap] },
      answers: [
        {
          gapId,
          question: defaultGapQuestion(gap).question,
          answer: answer || "I haven't done this.",
          hasExperience,
        },
      ],
      context: { gaps: match.gaps.filter((item) => item.id !== gapId), answers: earlier },
      sample: sampleForGap(jobId, gapId).proposal,
      requester: access.requester,
    });

    // A change whose `before` is not a line of this CV could never be placed, so it is not offered at all.
    const forGap = result.changes.filter((change) => change.gapId === gapId);
    const changes = forGap.filter((change) => fitsCv(profile, change));
    const nextSteps = result.nextSteps.filter((step) => step.gapId === gapId);
    if (changes.length === 0 && nextSteps.length === 0) {
      nextSteps.push({
        gapId,
        kind: "learn",
        suggestion: hasExperience
          ? "We could not find a line we can back up with what you told us, so nothing is added. Add a specific example: where, what you did and what changed."
          : "You told us you have not done this yet, so it stays off your CV. Build it through a short course or a small project first, then add it.",
      });
    }
    return { ok: true, changes, nextSteps, removed: result.removed.length + forGap.length - changes.length };
  } catch (error) {
    return { ok: false, message: modelFailureMessage(error, "suggest a change", "We could not write a suggestion just now. Try again in a moment.") };
  }
}

const DecisionSchema = TailoringChangeSchema.extend({ status: z.enum(["approved", "rejected", "proposed"]) });

export type DecideChangeResult =
  | { saved: true }
  | { saved: false; reason: "invalid" | "not-connected" | "signed-out" | "sample-job" | "job-not-found" | "failed"; message: string };

// Jobs saved in the jobs table have a uuid; sample jobs ("sara-job-1") have no row, so their changes are not stored.
const StoredIdSchema = z.uuid();

/**
 * Saves the user's decision on one change (and any edit they made to its text) in tailoring_changes,
 * and records tailor.change_approved or tailor.change_rejected without any CV text.
 * `replaced` marks a change withdrawn because the user changed their answer: it is saved as rejected, but
 * it is not the user's decision, so no event is recorded.
 */
export async function decideChange(change: TailoringChange, options: { replaced?: boolean } = {}): Promise<DecideChangeResult> {
  const parsed = DecisionSchema.safeParse(change);
  if (!parsed.success) return { saved: false, reason: "invalid", message: "We could not read this change." };
  const decision = parsed.data;

  if (decision.status !== "proposed" && options.replaced !== true) {
    const name = decision.status === "approved" ? "tailor.change_approved" : "tailor.change_rejected";
    const properties = { section: decision.section, evidenceSource: decision.evidenceSource };
    after(async () => {
      const user = await getCurrentUser();
      await track(name, properties, user ? { userId: user.id } : await getAnonymousKey());
    });
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { saved: false, reason: "not-connected", message: "Saving is not switched on yet, so this decision lasts until you leave the page." };
  const user = await getCurrentUser();
  if (!user) return { saved: false, reason: "signed-out", message: "Sign in to keep your decisions." };
  if (!StoredIdSchema.safeParse(decision.jobId).success || !StoredIdSchema.safeParse(decision.id).success) {
    return { saved: false, reason: "sample-job", message: "This is a sample job, so your decisions are not saved." };
  }

  // Row-level security only checks user_id, so a job id from another account must be refused here (issue #28).
  const job = await supabase.from("jobs").select("id").eq("id", decision.jobId).maybeSingle();
  if (job.error) return failed("read the job", job.error.code);
  if (!job.data) return { saved: false, reason: "job-not-found", message: "We could not find this job in your account." };

  const { error } = await supabase
    .from("tailoring_changes")
    .upsert({ id: decision.id, job_id: decision.jobId, data: decision, updated_at: new Date().toISOString() });
  if (error) return failed("save the change", error.code);
  return { saved: true };
}

const CoverLetterRequestSchema = z.object({
  jobId: z.string().min(1).max(100),
  changes: z.array(TailoringChangeSchema).max(50),
  answers: z
    .array(z.object({ gapId: z.string().min(1).max(100), question: z.string().max(500), answer: z.string().max(2000), hasExperience: z.boolean() }))
    .max(30),
});
export type CoverLetterRequest = z.infer<typeof CoverLetterRequestSchema>;

export type CreateCoverLetterResult =
  | { ok: true; text: string; problems: BrandProblem[] }
  | { ok: false; message: string };

/**
 * Writes a cover letter for the job from the CV, the approved changes and the user's answers.
 * Returns the plain text for the user to edit and approve, with any brand problems found in it.
 */
export async function createCoverLetter(request: CoverLetterRequest): Promise<CreateCoverLetterResult> {
  const parsed = CoverLetterRequestSchema.safeParse(request);
  if (!parsed.success) return { ok: false, message: "We could not read your changes. Try again." };
  const { jobId, answers } = parsed.data;

  const access = await tailorModelAccess();
  if (!access.allowed) return { ok: false, message: "Sign in to write your cover letter." };

  const [profile, job, match] = await Promise.all([getMyProfile({ jobId }), getMyJob(jobId), getMyMatch(jobId)]);
  if (!profile || !job) return { ok: false, message: "We could not find this job. Open it again from your jobs." };
  const changes = parsed.data.changes.filter((change) => change.jobId === jobId && change.status === "approved");

  try {
    const letter = await writeCoverLetter({ profile, job, changes, answers, requester: access.requester });
    const text = coverLetterText(letter, profile.fullName);
    if (inventedTerms(text, match?.gaps ?? [], answers, profile).length > 0) {
      return { ok: false, message: "The draft mentioned something you told us you have not done, so we did not use it. Try again." };
    }

    after(async () => {
      const user = await getCurrentUser();
      await track(
        "tailor.cover_letter_created",
        { paragraphs: letter.paragraphs.length, approvedChanges: changes.length },
        user ? { userId: user.id } : await getAnonymousKey(),
      );
    });
    return { ok: true, text, problems: findBrandProblems(text) };
  } catch (error) {
    return {
      ok: false,
      message: modelFailureMessage(error, "write the cover letter", "We could not write your cover letter just now. Try again in a moment."),
    };
  }
}

function failed(step: string, code: string | undefined): DecideChangeResult {
  // The step and the code only: never the change text.
  console.error(`tailor: could not ${step} (${code ?? "unknown"})`);
  return { saved: false, reason: "failed", message: "We could not save this decision. Try again in a moment." };
}
