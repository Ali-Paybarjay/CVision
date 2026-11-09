import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getCurrentUser } from "@/features/account/current-user";
import type { Job, MatchResult, Profile } from "@/shared/contracts";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { gapQuestionsPrompt, skillGaps, strongerGaps } from "../gap-questions";
import { GapQuestionSchema, type GapQuestion } from "../types";

type Input = { profile: Profile; job: Job; match: MatchResult };

const StoredSchema = z.object({ key: z.string().min(1), questions: z.array(GapQuestionSchema) });

/**
 * A hash of the request text the model gets for these questions: the prompt file, the ad as jobForPrompt gives it,
 * the CV, the gaps and the strengths to make stronger (#416). When any of them changes, a new prompt included, the stored questions no longer fit
 * and new ones are asked for. The Profile's id and contact details are not in that text, so a re-saved Profile
 * keeps its questions.
 */
export async function gapQuestionsKey({ profile, job, match }: Input): Promise<string> {
  const prompt = await gapQuestionsPrompt({ profile, job, gaps: skillGaps(match.gaps), stronger: strongerGaps(job, match) });
  return createHash("sha256").update(prompt).digest("hex");
}

/** Signed in with Supabase connected, for a real job (a uuid). Sample jobs and visitors keep nothing. */
async function clientFor(jobId: string) {
  if (!z.uuid().safeParse(jobId).success) return null;
  const supabase = await createSupabaseServerClient();
  if (!supabase || !(await getCurrentUser())) return null;
  return supabase;
}

/** The questions asked before for this job, if they were written for the same Profile, ad and gaps. */
async function readStored(jobId: string, key: string): Promise<GapQuestion[] | null> {
  const supabase = await clientFor(jobId);
  if (!supabase) return null;
  const { data, error } = await supabase.from("gap_questions").select("data").eq("job_id", jobId).maybeSingle();
  if (error) {
    // The code only: never the question text.
    console.error(`tailor: could not read the gap questions (${error.code ?? "unknown"})`);
    return null;
  }
  const parsed = StoredSchema.safeParse(data?.data);
  return parsed.success && parsed.data.key === key ? parsed.data.questions : null;
}

async function store(jobId: string, key: string, questions: GapQuestion[]): Promise<void> {
  const supabase = await clientFor(jobId);
  if (!supabase) return;
  const { error } = await supabase
    .from("gap_questions")
    .upsert({ job_id: jobId, data: { key, questions } }, { onConflict: "job_id,user_id" });
  if (error) console.error(`tailor: could not keep the gap questions (${error.code ?? "unknown"})`);
}

/** Requests already on their way, so renders a moment apart on one server share one answer from the model. */
const inFlight = new Map<string, Promise<GapQuestion[]>>();

/**
 * The gap questions for one job, asked of the model once (#304). The Tailor page is rebuilt on the server after
 * many of its actions, and asking again each time used up the user's daily limit in under a minute. So the
 * questions are kept in gap_questions and read back while the request text stays the same: the Profile, the ad,
 * the gaps and the prompt itself. A job opened before a prompt change is asked again once, with the new prompt.
 * `ask` is only called when nothing fits; if it throws, nothing is kept and the error reaches the caller.
 * Keeping or reading them never stops the page: on a database error the questions are simply asked again.
 */
export async function keptGapQuestions(input: Input & { userId?: string }, ask: () => Promise<GapQuestion[]>): Promise<GapQuestion[]> {
  const key = await gapQuestionsKey(input);
  const jobId = input.job.id;
  const stored = await readStored(jobId, key).catch(() => null);
  if (stored) return stored;

  const flightKey = `${input.userId ?? "visitor"}:${jobId}:${key}`;
  const pending = inFlight.get(flightKey);
  if (pending) return pending;

  const request = (async () => {
    const questions = await ask();
    await store(jobId, key, questions).catch(() => console.error("tailor: could not keep the gap questions (unexpected)"));
    return questions;
  })();
  inFlight.set(flightKey, request);
  try {
    return await request;
  } finally {
    inFlight.delete(flightKey);
  }
}
