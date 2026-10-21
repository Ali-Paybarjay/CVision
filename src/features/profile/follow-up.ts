import { z } from "zod";
import type { FollowUpAnswer, Profile } from "@/shared/contracts";

// Follow-up questions ask for the evidence a CV is missing: numbers behind achievements,
// a result for each job, and an example for each listed skill. The answers are kept word for word
// in Profile.followUpAnswers, where they become evidence for tailored CVs (Nothing invented).

export const FollowUpTopicSchema = z.enum(["achievement", "role", "skill", "general"]);
export type FollowUpTopic = z.infer<typeof FollowUpTopicSchema>;

/** One question as the model writes it. */
export const FollowUpQuestionDraftSchema = z.object({
  question: z.string().min(1),
  /** One short sentence on why the answer helps the user's applications. */
  reason: z.string().min(1),
  topic: FollowUpTopicSchema,
  /** The achievement, job ("Title at Company") or skill the question is about, as written in the profile. */
  about: z.string(),
});

export const FollowUpQuestionSchema = FollowUpQuestionDraftSchema.extend({ id: z.string().min(1) });
export type FollowUpQuestion = z.infer<typeof FollowUpQuestionSchema>;

/** The model's answer: three to five questions. */
export const FollowUpQuestionListSchema = z.object({
  questions: z.array(FollowUpQuestionDraftSchema).min(3).max(5),
});

export const MIN_QUESTIONS = 3;
export const MAX_QUESTIONS = 5;

/**
 * Rule-based questions for a profile, most useful first: three to five of them.
 * They are the mock answer for the model, and the suggestions it starts from in live mode.
 */
export function suggestFollowUpQuestions(profile: Profile): FollowUpQuestion[] {
  const asked = new Set(profile.followUpAnswers.map((answer) => normalise(answer.question)));
  const evidence = evidenceText(profile);

  const achievements: Candidate[] = [];
  const roles: Candidate[] = [];
  for (const job of profile.experience) {
    for (const achievement of job.achievements.filter((line) => !hasNumber(line))) {
      achievements.push({
        topic: "achievement",
        about: achievement,
        question: `At ${job.company}, you wrote “${achievement}”. What changed as a result? A number helps: time saved, money, people or a percentage.`,
        reason: "A result with a number shows employers the size of your impact.",
      });
    }
    if (job.achievements.length === 0) {
      roles.push({
        topic: "role",
        about: `${job.title} at ${job.company}`,
        question: `What is one result you are proud of from your time as ${job.title} at ${job.company}?`,
        reason: "Each job on your CV is stronger with at least one result.",
      });
    }
  }

  const skills: Candidate[] = profile.skills
    .filter((skill) => !isMentioned(skill, evidence))
    .map((skill) => ({
      topic: "skill",
      about: skill,
      question: `Your CV lists ${skill}. Where have you used it? Describe one piece of work.`,
      reason: "We only use a skill in a tailored CV when there is an example behind it.",
    }));

  const picked = takeInTurn([achievements, roles, skills], MAX_QUESTIONS, asked);
  for (const fallback of generalQuestions) {
    if (picked.length >= MIN_QUESTIONS) break;
    if (!asked.has(normalise(fallback.question))) picked.push(fallback);
  }

  return picked.map((candidate, index) => ({ id: `q${index + 1}`, ...candidate }));
}

/**
 * Adds the user's answer to their profile, exactly as they wrote it (only the outer spaces are trimmed).
 * A new answer to the same question replaces the old one.
 */
export function recordFollowUpAnswer(
  profile: Profile,
  question: Pick<FollowUpQuestion, "question">,
  answer: string,
  options: { id: string; answeredAt: Date },
): Profile {
  const text = answer.trim();
  if (!text) {
    throw new Error("An answer cannot be empty.");
  }
  const entry: FollowUpAnswer = {
    id: options.id,
    question: question.question,
    answer: text,
    answeredAt: options.answeredAt.toISOString(),
  };
  return {
    ...profile,
    followUpAnswers: [...profile.followUpAnswers.filter((existing) => existing.question !== question.question), entry],
  };
}

/** The answer already given to a question, if any. */
export function findAnswer(profile: Profile, question: Pick<FollowUpQuestion, "question">): FollowUpAnswer | undefined {
  return profile.followUpAnswers.find((answer) => answer.question === question.question);
}

type Candidate = Omit<FollowUpQuestion, "id">;

const generalQuestions: Candidate[] = [
  {
    topic: "general",
    about: "",
    question: "What is the piece of work you are proudest of from the last two years, and what was the result?",
    reason: "A strong example gives your CV and cover letter something specific to build on.",
  },
  {
    topic: "general",
    about: "",
    question: "Which tools or software do you use most in your work, and what do you use them for?",
    reason: "Employers search CVs for the tools they use, so each one needs a real example.",
  },
  {
    topic: "general",
    about: "",
    question: "Tell us about a time you solved a problem for a customer or a colleague. What did you do, and what happened?",
    reason: "Problem-solving examples are what UK employers ask for in competency questions.",
  },
];

/** Takes one from each list in turn, so the questions cover different parts of the CV. */
function takeInTurn(lists: Candidate[][], limit: number, asked: Set<string>): Candidate[] {
  const queues = lists.map((list) => list.filter((candidate) => !asked.has(normalise(candidate.question))));
  const picked: Candidate[] = [];
  while (picked.length < limit && queues.some((queue) => queue.length > 0)) {
    for (const queue of queues) {
      const next = queue.shift();
      if (next && picked.length < limit) picked.push(next);
    }
  }
  return picked;
}

const NUMBER_WORDS =
  /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred|thousand|million|half|double|twice|triple)\b/i;

/** True when a line has a figure in it: a digit, a number word, or a £, $, € or % sign. */
export function hasNumber(line: string): boolean {
  return /[\d%£$€]/.test(line) || NUMBER_WORDS.test(line);
}

/** Everything in the profile that can show a skill in use. The skills list itself does not count. */
function evidenceText(profile: Profile): string {
  return [
    profile.summary,
    ...profile.experience.flatMap((job) => [job.title, ...job.duties, ...job.achievements]),
    ...profile.education.map((course) => `${course.qualification} ${course.subject ?? ""}`),
    ...profile.certifications.map((certificate) => certificate.name),
    ...profile.followUpAnswers.map((answer) => answer.answer),
  ].join("\n");
}

const STOP_WORDS = new Set(["and", "or", "of", "the", "to", "in", "for", "with", "on", "at", "a", "an"]);

/**
 * A rough check that a skill appears in the evidence: every main word of it does, ignoring endings
 * ("planning" matches "planned"). Words in brackets are details and are skipped: "Python (pandas)" needs "Python".
 */
export function isMentioned(skill: string, evidence: string): boolean {
  // [^()] rather than [^)]: an unclosed "(" then stops at the next "(", so "((((…" takes linear time, not quadratic.
  const core = skill.replace(/\([^()]*\)/g, " ").trim();
  const words = core.split(/[^\p{L}\p{N}+#.]+/u).filter((word) => word && !STOP_WORDS.has(word.toLowerCase()));
  // Single letters ("P&L" splits into P and L) only count when they are the whole skill, like "R" or "C".
  const significant = words.length > 1 ? words.filter((word) => word.length > 1) : words;
  if (significant.length === 0) return false;

  return significant.every((word) => {
    if (word.length <= 2) {
      // Short names such as "R", "Go" or "UX" must match a whole word with the same capitals.
      return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(word)}($|[^\\p{L}\\p{N}])`, "u").test(evidence);
    }
    const stem = word.length > 4 ? word.slice(0, 4) : word;
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(stem)}`, "iu").test(evidence);
  });
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalise(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}
