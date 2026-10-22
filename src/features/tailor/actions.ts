"use server";

import { after } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/features/account/current-user";
import { track } from "@/shared/analytics/track";
import { getAnonymousKey } from "@/shared/ai/anonymous-key";
import { TailoringChangeSchema, type TailoringChange } from "@/shared/contracts";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { defaultGapQuestion } from "./gap-questions";
import { proposeChanges } from "./propose-changes";
import { sampleForGap } from "./samples";
import { getMyJob, getMyMatch, getMyProfile } from "./server/my-data";
import type { NextStep } from "./types";

// Anyone can call a Server Action, so every input is checked before use.
const AnswerGapSchema = z.object({
  jobId: z.string().min(1).max(100),
  gapId: z.string().min(1).max(100),
  answer: z.string().max(2000),
  hasExperience: z.boolean(),
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

  const [profile, job, match] = await Promise.all([getMyProfile(), getMyJob(jobId), getMyMatch(jobId)]);
  const gap = match?.gaps.find((item) => item.id === gapId);
  if (!profile || !job || !match || !gap) return { ok: false, message: "We could not find this job. Open it again from your jobs." };

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
      sample: sampleForGap(jobId, gapId).proposal,
    });

    const changes = result.changes.filter((change) => change.gapId === gapId);
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
    return { ok: true, changes, nextSteps, removed: result.removed.length };
  } catch {
    return { ok: false, message: "We could not write a suggestion just now. Try again in a moment." };
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
 */
export async function decideChange(change: TailoringChange): Promise<DecideChangeResult> {
  const parsed = DecisionSchema.safeParse(change);
  if (!parsed.success) return { saved: false, reason: "invalid", message: "We could not read this change." };
  const decision = parsed.data;

  if (decision.status !== "proposed") {
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

function failed(step: string, code: string | undefined): DecideChangeResult {
  // The step and the code only: never the change text.
  console.error(`tailor: could not ${step} (${code ?? "unknown"})`);
  return { saved: false, reason: "failed", message: "We could not save this decision. Try again in a moment." };
}
