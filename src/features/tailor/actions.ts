"use server";

import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/features/account/current-user";
import { recordApplication } from "@/features/tracker/actions";
import { track } from "@/shared/analytics/track";
import { getAnonymousKey } from "@/shared/ai/anonymous-key";
import { TailoringChangeSchema, type TailoringChange } from "@/shared/contracts";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { findBrandProblems, type BrandProblem } from "./brand-check";
import { coverLetterText, declinedRequirements, inventedTerms, writeCoverLetter } from "./cover-letter";
import { blocksToFile, cvBlocks, exportFileName, letterBlocks, mimeTypes, pdfLosesLetters } from "./export";
import { defaultGapQuestion } from "./gap-questions";
import { enforceNothingInvented } from "./nothing-invented";
import { proposeChanges, suggestFromCv } from "./propose-changes";
import { sampleCvSuggestionsFor, sampleForGap } from "./samples";
import { letterHead } from "./letter-state";
import { modelFailureMessage, tailorModelAccess } from "./server/model-access";
import { getMyJob, getMyMatch, getMyProfile } from "./server/my-data";
import { buildTailoredCv, fitsCv } from "./tailored-cv";
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
  /** The optional one-line detail the user added; empty for a plain tap. */
  answer: z.string().max(2000),
  hasExperience: z.boolean(),
  /** Which "yes" the user tapped: at work, or in study or on their own. */
  where: z.enum(["work", "study"]).optional(),
  /** The answer option the user tapped, or the words they wrote instead: what they say they have done. */
  chosen: z.string().trim().min(1).max(300).optional(),
  /** True when `chosen` is what the user wrote, not an option they tapped. */
  typed: z.boolean().optional(),
  /** The user's answers to the job's other gaps, so a "no" there still counts here (Nothing invented). */
  earlierAnswers: z.array(EarlierAnswerSchema).max(30).optional(),
});
export type AnswerGapInput = z.infer<typeof AnswerGapSchema>;

export type AnswerGapResult =
  | {
      ok: true;
      /** The user's answer as one sentence, the evidence any change quotes; kept for the cover letter. */
      answer: string;
      /** False when the user said no, by the button or in their own words; the page keeps this with the answer. */
      hasExperience: boolean;
      changes: TailoringChange[];
      nextSteps: NextStep[];
      /** One optional tip when a "yes" gave nothing to add; never a question the user must answer. */
      hint: string | null;
      removed: number;
    }
  | { ok: false; message: string };

/** The user's tap and optional detail as one sentence in their name, e.g. "Yes, I have done this at work: Power BI." */
function answerSentence(requirement: string, where: "work" | "study", detail: string): string {
  const base = `Yes, I have done this ${where === "work" ? "at work" : "in study or on my own"}: ${requirement.replace(/[.\s]+$/, "")}.`;
  return detail ? `${base} ${detail}` : base;
}

/**
 * A requirement that is just the name of one tool or skill, e.g. "Power BI", so a plain "yes" can go on the CV as it is.
 * Not "Asana or Jira", and not "3+ years of Python experience" or "First-class degree": a tap does not confirm those.
 */
function isOneSkill(requirement: string): boolean {
  if (namesSeveral(requirement) || /\band\b|\d|\b(years?|experience|experienced|strong|proficiency|proficient|knowledge|degree|ability|managing)\b/i.test(requirement)) return false;
  // A level or a qualification is a claim of its own: a tap on "I used Advanced Excel" does not confirm "Advanced".
  if (/\b(advanced|expert|fluent|native|excellent|senior|bsc|msc|ba|ma|phd|bachelor'?s?|master'?s?|chartered|qualification|qualified|certificate|certified|card|licen[cs]e)\b/i.test(requirement)) return false;
  return requirement.trim().split(/\s+/).length <= 5;
}

function namesSeveral(requirement: string): boolean {
  return /\s+or\s+|,|\//i.test(requirement);
}

/**
 * True when the words the user wrote start by saying they have not done it, e.g. "No", "Not yet. I am still studying"
 * or "I don't have a CSCS card yet". Not "No problem, I ran it" or "I don't just use Excel".
 */
function saysNo(text: string): boolean {
  const answer = text.trim().toLowerCase().replace(/[’]/g, "'");
  if (/^(no problem|no doubt|not only|not just|i (don't|do not) (just|only))\b/.test(answer)) return false;
  return /^(no(?!-)|nope|nah|not yet|not really|none)\b|^never (used|done|had|worked|held)\b|^i (have not|haven't|havent|have never|haven't ever|do not|don't|dont|did not|didn't|didnt|never)\b/.test(answer);
}

/**
 * Turns the user's answer to one gap question into suggested changes. A tap is enough: "yes" to a single tool or
 * skill always gives a suggestion, and the user is never asked for more. Every change starts as "proposed" and has
 * passed the Nothing invented check; a "no" never changes the CV and gets a next step instead.
 */
export async function answerGap(input: AnswerGapInput): Promise<AnswerGapResult> {
  const parsed = AnswerGapSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "We could not read your answer. Try again." };
  const { jobId, gapId } = parsed.data;
  const detail = parsed.data.answer.trim();
  const chosen = parsed.data.chosen;
  const typed = parsed.data.typed === true && chosen !== undefined;
  // A "no" in the user's own words counts as the No button does, so every guard against adding it applies.
  const hasExperience = parsed.data.hasExperience && !(typed && saysNo(chosen));

  const access = await tailorModelAccess();
  if (!access.allowed) return { ok: false, message: access.message };

  const [profile, job, match] = await Promise.all([getMyProfile({ jobId }), getMyJob(jobId), getMyMatch(jobId)]);
  const gap = match?.gaps.find((item) => item.id === gapId);
  if (!profile || !job || !match || !gap) return { ok: false, message: "We could not find this job. Open it again from your jobs." };
  const answer = !hasExperience
    ? (typed ? chosen : detail) || "I haven't done this."
    : chosen
      ? [chosen, detail].filter(Boolean).join(". ")
      : answerSentence(gap.requirement, parsed.data.where ?? "work", detail);

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
      answers: [{ gapId, question: defaultGapQuestion(gap).question, answer, hasExperience }],
      context: { gaps: match.gaps.filter((item) => item.id !== gapId), answers: earlier },
      sample: sampleForGap(jobId, gapId).proposal,
      requester: access.requester,
    });

    // A change whose `before` is not a line of this CV could never be placed, so it is not offered at all.
    const forGap = result.changes.filter((change) => change.gapId === gapId);
    const changes = forGap.filter((change) => fitsCv(profile, change));
    const removed = result.removed.length + forGap.length - changes.length;
    const nextSteps = hasExperience ? [] : result.nextSteps.filter((step) => step.gapId === gapId);
    let hint: string | null = null;

    if (hasExperience && changes.length === 0) {
      // A plain "yes" to one tool or skill goes on the CV as that skill, quoting the user's own answer. Words the
      // user wrote are for the model to read, because naming the skill is not the same as saying they have it.
      const skill = { gapId, section: "skills" as const, before: null, after: gap.requirement.trim(), evidence: answer, evidenceSource: "follow-up-answer" as const };
      const { kept } = enforceNothingInvented(!typed && gap.kind === "missing" && isOneSkill(gap.requirement) ? [skill] : [], {
        profile,
        gaps: match.gaps,
        answers: [...earlier, { gapId, question: "", answer, hasExperience }],
      });
      changes.push(...kept.map((item) => ({ ...item, id: randomUUID(), jobId: job.id, status: "proposed" as const })));
      if (changes.length === 0) {
        hint =
          gap.kind === "unclear"
            ? "Your CV already mentions this. To make that line stronger, add a detail such as a number or an example. This is optional."
            : namesSeveral(gap.requirement) && !typed
              ? "Tell us which one you have used, and we will add it. This is optional."
              : "Add where you did this and what changed, and we will suggest a line for your CV. This is optional.";
      }
    }
    if (!hasExperience && nextSteps.length === 0) {
      nextSteps.push({
        gapId,
        kind: "learn",
        suggestion: "You told us you have not done this yet, so it stays off your CV. Build it through a short course or a small project first, then add it.",
      });
    }
    return { ok: true, answer, hasExperience, changes, nextSteps, hint, removed };
  } catch (error) {
    return { ok: false, message: modelFailureMessage(error, "suggest a change", "We could not write a suggestion just now. Try again in a moment.") };
  }
}

export type SuggestCvResult = { ok: true; changes: TailoringChange[] } | { ok: false; message: string };

/**
 * Suggestions made from the CV alone, shown before any question: the user's own lines, rewritten for the job.
 * Each one quotes the CV line it comes from and waits for the user's approval.
 */
export async function suggestCvChanges(jobId: string): Promise<SuggestCvResult> {
  const parsed = z.string().min(1).max(100).safeParse(jobId);
  if (!parsed.success) return { ok: false, message: "We could not read this job." };

  const access = await tailorModelAccess();
  if (!access.allowed) return { ok: false, message: access.message };

  const [profile, job, match] = await Promise.all([getMyProfile({ jobId }), getMyJob(jobId), getMyMatch(jobId)]);
  if (!profile || !job || !match) return { ok: false, message: "We could not find this job. Open it again from your jobs." };

  try {
    const result = await suggestFromCv({ profile, job, match, sample: sampleCvSuggestionsFor(job.id), requester: access.requester });
    return { ok: true, changes: result.changes };
  } catch (error) {
    return { ok: false, message: modelFailureMessage(error, "suggest changes from the CV", "We could not suggest changes just now. Try again in a moment.") };
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
    const gaps = match?.gaps ?? [];
    const declined = declinedRequirements(gaps, answers, profile);
    const input = { profile, job, changes, answers, declined, requester: access.requester };
    let letter = await writeCoverLetter(input);
    let text = coverLetterText(letter, profile.fullName);
    let named = inventedTerms(text, gaps, answers, profile);
    // One more try that says what to leave out, so the user is not left to spend a request on the same draft.
    if (named.length > 0) {
      letter = await writeCoverLetter({ ...input, namedInLastDraft: named });
      text = coverLetterText(letter, profile.fullName);
      named = inventedTerms(text, gaps, answers, profile);
    }
    if (named.length > 0) {
      return { ok: false, message: `The draft kept mentioning “${named[0]}”, which you told us you have not done, so we did not use it. Try again, or change your answer to that question.` };
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

export type ApplyResult = { recorded: boolean; message: string };

/**
 * Called when the user presses Apply, as the employer's page opens in a new tab: adds the job to their
 * tracker with Ali's recordApplication and records tailor.apply_clicked. The app never applies itself.
 */
export async function recordApply(jobId: string): Promise<ApplyResult> {
  const parsed = z.string().min(1).max(100).safeParse(jobId);
  if (!parsed.success) return { recorded: false, message: "We could not read this job." };

  const result = await recordApplication(parsed.data);
  after(async () => {
    const user = await getCurrentUser();
    await track(
      "tailor.apply_clicked",
      { recorded: result.ok, reason: result.ok ? (result.created ? "created" : "existing") : result.reason },
      user ? { userId: user.id } : await getAnonymousKey(),
    );
  });

  return result.ok
    ? { recorded: true, message: "Added to your applications, so you can follow it up from your dashboard." }
    : { recorded: false, message: result.message };
}

const ExportRequestSchema = z.object({
  jobId: z.string().min(1).max(100),
  document: z.enum(["cv", "cover-letter"]),
  format: z.enum(["pdf", "docx"]),
  changes: z.array(TailoringChangeSchema).max(50),
  /** The cover letter exactly as the user approved it; only used for the cover letter. */
  letter: z.string().max(10000).nullable(),
});
export type ExportRequest = z.infer<typeof ExportRequestSchema>;

export type ExportResult =
  /** `warning` tells the user when the file is not quite what they see, e.g. letters the PDF cannot show. */
  | { ok: true; fileName: string; mimeType: string; base64: string; warning: string | null }
  | { ok: false; message: string };

/**
 * Builds the PDF or Word file of the tailored CV or the approved cover letter. The CV is rebuilt here from the
 * Profile and only the approved changes, so a change the user rejected or has not decided on never reaches the file.
 */
export async function exportDocument(request: ExportRequest): Promise<ExportResult> {
  const parsed = ExportRequestSchema.safeParse(request);
  if (!parsed.success) return { ok: false, message: "We could not read your changes. Try again." };
  const { jobId, document, format, letter } = parsed.data;

  const [profile, job] = await Promise.all([getMyProfile({ jobId }), getMyJob(jobId)]);
  if (!profile || !job) return { ok: false, message: "We could not find this job. Open it again from your jobs." };
  if (document === "cover-letter" && !letter?.trim()) return { ok: false, message: "Approve your cover letter first, then download it." };

  const changes = parsed.data.changes.filter((change) => change.jobId === jobId);
  const blocks = document === "cv" ? cvBlocks(buildTailoredCv(profile, changes, job)) : letterBlocks(letter ?? "", letterHead(profile, new Date()));
  const title = `${document === "cv" ? "CV" : "Cover letter"}: ${job.title}, ${job.company}`;
  const warning =
    format === "pdf" && pdfLosesLetters(blocks, { title, author: profile.fullName })
      ? `Some letters in your ${document === "cv" ? "CV" : "cover letter"} cannot be shown in the PDF, so they appear as ?. Download the Word file instead.`
      : null;

  try {
    const bytes = await blocksToFile(blocks, format, { title, author: profile.fullName });
    after(async () => {
      const user = await getCurrentUser();
      const approvedChanges = changes.filter((change) => change.status === "approved").length;
      await track("tailor.cv_exported", { format, document, approvedChanges }, user ? { userId: user.id } : await getAnonymousKey());
    });
    return {
      ok: true,
      fileName: exportFileName(profile.fullName, job.title, document, format),
      mimeType: mimeTypes[format],
      base64: Buffer.from(bytes).toString("base64"),
      warning,
    };
  } catch {
    return { ok: false, message: "We could not make your file just now. Try again in a moment." };
  }
}

function failed(step: string, code: string | undefined): DecideChangeResult {
  // The step and the code only: never the change text.
  console.error(`tailor: could not ${step} (${code ?? "unknown"})`);
  return { saved: false, reason: "failed", message: "We could not save this decision. Try again in a moment." };
}
