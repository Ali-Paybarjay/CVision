// Pure checks on every stage's output. Each returns a list of problems; an empty list means the output is valid.
// Messages name the field and the rule, never the CV, job description or answer text (they can reach logs).
import { brand } from "@/shared/brand";
import { levelMix, limits } from "../config";
import type {
  CandidateProfile,
  LevelBand,
  PlannedFollowUp,
  RoleProfile,
  TechnicalInterviewQuestion,
  TechnicalQuestionType,
} from "../contracts";
import { countWords, isVerbatim, splitSentences, type CvLine } from "./text";

/** The soft length rules. A problem that names one is recorded, not sent back to the model (see isLengthProblem). */
export type LengthRule = "question-words" | "follow-up-length" | "quote-words" | "improvement-length" | "sample-answer-words";

export type Problem = { path: (string | number)[]; message: string; lengthRule?: LengthRule };

/** Length rules never fail a stage: a reply that is one sentence too long is still worth showing. */
export function isLengthProblem(problem: Problem): boolean {
  return problem.lengthRule !== undefined;
}

/**
 * Protected characteristics (Equality Act 2010), health, family, age and nationality. Matched as whole words or
 * phrases, so "voltage" never matches "age". Ambiguous words are left out on purpose because they are everyday
 * technical language: "disabled" (an interlock), "partner" (business partner), "impairment" (accounting),
 * "race" (race condition), "native" (native app), "child" (child process), "family" (product family),
 * "faith" (good faith).
 */
export const bannedTopicTerms = [
  "age",
  "aged",
  "how old",
  "date of birth",
  "birthday",
  "retirement age",
  "disability",
  "disabilities",
  "health condition",
  "medical condition",
  "medical history",
  "mental health",
  "illness",
  "sick leave",
  "sickness",
  "pregnant",
  "pregnancy",
  "maternity",
  "paternity",
  "married",
  "marriage",
  "marital",
  "civil partnership",
  "spouse",
  "husband",
  "wife",
  "girlfriend",
  "boyfriend",
  "children",
  "childcare",
  "kids",
  "family commitments",
  "your family",
  "religion",
  "religious",
  "church",
  "mosque",
  "synagogue",
  "temple",
  "pray",
  "prayer",
  "ethnicity",
  "ethnic",
  "racial",
  "nationality",
  "citizenship",
  "immigration",
  "visa",
  "country of origin",
  "where are you from",
  "mother tongue",
  "first language",
  "accent",
  "sexual orientation",
  "gay",
  "lesbian",
  "bisexual",
  "transgender",
  "gender identity",
  "gender reassignment",
] as const;

const bannedTopicPatterns = bannedTopicTerms.map(
  (term) => [term, new RegExp(`(?<![a-z])${term.replace(/ /g, "\\s+")}(?![a-z])`, "i")] as const,
);

/** The banned topic terms that appear in a text, as whole words. */
export function bannedTopicHits(text: string): string[] {
  return bannedTopicPatterns.filter(([, pattern]) => pattern.test(text)).map(([term]) => term);
}

/** Brand phrases that must never appear in anything the app writes (docs/brand.md). */
export function brandPhraseHits(text: string): string[] {
  const lower = text.toLowerCase();
  return brand.bannedPhrases.filter((phrase) => lower.includes(phrase.toLowerCase()));
}

/**
 * US spellings that break the voice's UK English rule (prompts/_voice.md). Whole words only, and only words
 * with no UK meaning: "program" (software) and "license" (the verb) are left out on purpose.
 */
export const usSpellings = [
  "color",
  "colors",
  "organization",
  "organizations",
  "organize",
  "organized",
  "analyze",
  "analyzed",
  "analyzing",
  "behavior",
  "behaviors",
  "favor",
  "favorite",
  "center",
  "centers",
  "optimize",
  "optimized",
  "prioritize",
  "prioritized",
  "summarize",
  "summarized",
  "recognize",
  "recognized",
  "practicing",
  "modeling",
  "labor",
  "résumé",
] as const;

/** Praise or advice that fits any answer. The voice asks for feedback tied to this answer and this job. */
export const genericFeedbackPhrases = [
  "great answer",
  "good answer",
  "excellent answer",
  "well done",
  "good job",
  "nice job",
  "great job",
  "keep it up",
  "keep practising",
  "keep practicing",
  "practise more",
  "practice more",
  "be more confident",
] as const;

function wholePhrase(term: string): RegExp {
  return new RegExp(`(?<!\\p{L})${term.replace(/ /g, "\\s+")}(?!\\p{L})`, "iu");
}

const usSpellingPatterns = usSpellings.map((term) => [term, wholePhrase(term)] as const);
const genericFeedbackPatterns = genericFeedbackPhrases.map((term) => [term, wholePhrase(term)] as const);

/**
 * The US spellings that appear in a text, as whole words. Feedback quotes the candidate, the job title and the
 * question, so a spelling inside double quotes, or one that `quotable` also uses, is the source's, not the model's.
 */
export function usSpellingHits(text: string, quotable = ""): string[] {
  const own = text.replace(/"[^"\n]*"|“[^”\n]*”/g, " ");
  return usSpellingPatterns.filter(([, pattern]) => pattern.test(own) && !pattern.test(quotable)).map(([term]) => term);
}

/** The generic praise or advice phrases that appear in a text. */
export function genericFeedbackHits(text: string): string[] {
  return genericFeedbackPatterns.filter(([, pattern]) => pattern.test(text)).map(([term]) => term);
}

function sentenceCount(text: string): number {
  return splitSentences(text).length;
}

/** Exactly one question mark, at the end. */
export function isSingleQuestion(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.endsWith("?") && (trimmed.match(/\?/g) ?? []).length === 1;
}

/** One question on one line, with none of the model's own reasoning leaking into it. */
function isFollowUpShape(text: string): boolean {
  const trimmed = text.trim();
  if (!isSingleQuestion(trimmed) || trimmed.includes("\n")) return false;
  return !/\b(the candidate|candidate's|I should|I will ask|I'll ask|let me|planned follow-up|follow-up question|gap type)\b/i.test(trimmed);
}

/** At most 40 words, with at most one short lead-in sentence ("You said X. Why…?"). */
function isFollowUpLength(text: string): boolean {
  return countWords(text) <= limits.followUpMaxWords && sentenceCount(text) <= 2;
}

/** A follow-up fit to show the candidate: the right shape and the right length. */
export function isCleanFollowUp(text: string): boolean {
  return isFollowUpShape(text) && isFollowUpLength(text);
}

/** Nothing the candidate would have to see: no symbols, formulas, line breaks or abbreviated units. */
export function isSpeakable(text: string): boolean {
  if (/[\n/=^×±°²³<>|{}[\]#*_~\\]/.test(text)) return false;
  return !/\d\s?(kg|kW|kWh|MW|mm|km|ml|psi|mph)\b/.test(text);
}

export function levelIndex(level: LevelBand): number {
  return Number(level.slice(1));
}

export function isLevelBelow(level: LevelBand, than: LevelBand): boolean {
  return levelIndex(level) < levelIndex(than);
}

/** How many questions would have to move for the set to match the level table. */
export function mixDistance(types: TechnicalQuestionType[], level: LevelBand): number {
  const expected = levelMix[level];
  let difference = 0;
  for (const type of Object.keys(expected) as TechnicalQuestionType[]) {
    difference += Math.abs(types.filter((t) => t === type).length - expected[type]);
  }
  return difference / 2;
}

/** Competency ids that are must-have and weak or missing in the CV. */
export function mustHaveGapIds(role: RoleProfile, candidate: CandidateProfile): string[] {
  const mustHave = new Set(role.competencies.filter((c) => c.priority === "must-have").map((c) => c.id));
  return candidate.gaps.map((gap) => gap.competencyId).filter((id) => mustHave.has(id));
}

function duplicates(values: string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) !== index);
}

export function analysisProblems(
  output: { roleProfile: RoleProfile; candidateProfile: CandidateProfile },
  jobDescription: string,
  cv: string,
): Problem[] {
  const problems: Problem[] = [];
  const { roleProfile: role, candidateProfile: candidate } = output;
  const ids = role.competencies.map((c) => c.id);

  if (role.competencies.length < 4 || role.competencies.length > 8) {
    problems.push({ path: ["roleProfile", "competencies"], message: "List 4 to 8 competencies." });
  }
  for (const id of duplicates(ids)) {
    problems.push({ path: ["roleProfile", "competencies"], message: `Competency id ${id} is used twice.` });
  }
  if (!isVerbatim(role.roleLevelReason.jdQuote, jobDescription)) {
    problems.push({ path: ["roleProfile", "roleLevelReason", "jdQuote"], message: "Must be copied exactly from the job description." });
  }
  role.competencies.forEach((competency, i) => {
    if (!isVerbatim(competency.jdQuote, jobDescription)) {
      problems.push({ path: ["roleProfile", "competencies", i, "jdQuote"], message: "Must be copied exactly from the job description." });
    }
  });
  role.namedItems.forEach((item, i) => {
    if (!isVerbatim(item.text, jobDescription)) {
      problems.push({ path: ["roleProfile", "namedItems", i, "text"], message: "Must be copied exactly from the job description." });
    }
  });

  const evidenceIds = candidate.evidence.map((e) => e.competencyId);
  if (evidenceIds.length !== ids.length || ids.some((id) => !evidenceIds.includes(id)) || duplicates(evidenceIds).length) {
    problems.push({ path: ["candidateProfile", "evidence"], message: "Give exactly one evidence entry for each competency." });
  }
  candidate.evidence.forEach((entry, i) => {
    if (entry.cvQuote !== null && !isVerbatim(entry.cvQuote, cv)) {
      problems.push({ path: ["candidateProfile", "evidence", i, "cvQuote"], message: "Must be copied exactly from the CV, or null." });
    }
    if (entry.cvQuote === null && entry.estimatedLevel !== null) {
      problems.push({ path: ["candidateProfile", "evidence", i, "estimatedLevel"], message: "Must be null when there is no CV evidence." });
    }
  });
  if (candidate.claimsToProbe.length < 3 || candidate.claimsToProbe.length > 6) {
    problems.push({ path: ["candidateProfile", "claimsToProbe"], message: "List 3 to 6 claims." });
  }
  candidate.claimsToProbe.forEach((claim, i) => {
    if (!isVerbatim(claim.quote, cv)) {
      problems.push({ path: ["candidateProfile", "claimsToProbe", i, "quote"], message: "Must be copied exactly from the CV." });
    }
  });
  const mustHave = new Set(role.competencies.filter((c) => c.priority === "must-have").map((c) => c.id));
  candidate.gaps.forEach((gap, i) => {
    if (!mustHave.has(gap.competencyId)) {
      problems.push({ path: ["candidateProfile", "gaps", i, "competencyId"], message: "Gaps list must-have competencies only." });
    }
  });
  const listedGaps = new Set(candidate.gaps.map((gap) => gap.competencyId));
  candidate.evidence.forEach((entry, i) => {
    if (entry.cvQuote === null && mustHave.has(entry.competencyId) && !listedGaps.has(entry.competencyId)) {
      problems.push({ path: ["candidateProfile", "evidence", i], message: "A must-have competency with no CV evidence must be listed in gaps." });
    }
  });
  return problems;
}

/** The fields of a question that the model writes (the code adds kind, category, level and answer guide). */
export type DraftQuestion = Pick<
  TechnicalInterviewQuestion,
  "id" | "type" | "competencyId" | "focus" | "stretch" | "text" | "lookFors" | "anchors" | "redFlags" | "followUps"
> & { rationale: { jdQuote: string; cvQuote: string | null; why: string } };

export type DraftBlueprint = {
  mixNote: string | null;
  slots: { questionId: string; type: TechnicalQuestionType; competencyId: string; focus: DraftQuestion["focus"]; reason: string }[];
};

export type QuestionSetContext = {
  roleProfile: RoleProfile;
  candidateProfile: CandidateProfile;
  jobDescription: string;
  cv: string;
  count: number;
};

function followUpProblems(followUps: PlannedFollowUp[], path: (string | number)[], strict: boolean): Problem[] {
  const problems: Problem[] = [];
  if (followUps.length < 2 || followUps.length > 3) problems.push({ path, message: "Plan 2 or 3 follow-ups." });
  if (duplicates(followUps.map((f) => f.gapType)).length) problems.push({ path, message: "Each follow-up needs a different gap type." });
  if (duplicates(followUps.map((f) => f.id)).length) problems.push({ path, message: "Follow-up ids must be unique." });
  if (strict) {
    followUps.forEach((followUp, i) => {
      if (!isFollowUpShape(followUp.text)) {
        problems.push({ path: [...path, i, "text"], message: "Must be one question on one line, with no notes." });
      }
      if (!isFollowUpLength(followUp.text)) {
        problems.push({
          path: [...path, i, "text"],
          message: `Must be at most ${limits.followUpMaxWords} words, with at most one lead-in sentence.`,
          lengthRule: "follow-up-length",
        });
      }
      if (!isSpeakable(followUp.text)) problems.push({ path: [...path, i, "text"], message: "Must be speakable: no symbols or abbreviated units." });
      if (bannedTopicHits(followUp.text).length) problems.push({ path: [...path, i, "text"], message: "Touches a protected or personal topic." });
    });
  }
  return problems;
}

/**
 * Checks a question set. `stage: "generate"` checks structure only; the review stage is the quality gate, so
 * `stage: "review"` adds every rule on wording, fairness, quotes and the overall mix.
 */
export function questionSetProblems(
  output: { blueprint: DraftBlueprint; questions: DraftQuestion[] },
  context: QuestionSetContext,
  stage: "generate" | "review",
): Problem[] {
  const problems: Problem[] = [];
  const { questions, blueprint } = output;
  const competencyIds = new Set(context.roleProfile.competencies.map((c) => c.id));

  if (questions.length !== context.count) {
    problems.push({ path: ["questions"], message: `Write exactly ${context.count} questions.` });
  }
  questions.forEach((question, i) => {
    const path = ["questions", i];
    if (question.id !== `q${i + 1}`) problems.push({ path: [...path, "id"], message: `Use the id q${i + 1}.` });
    if (!competencyIds.has(question.competencyId)) {
      problems.push({ path: [...path, "competencyId"], message: "Must be a competency id from the role profile." });
    }
    if (question.lookFors.length < 3 || question.lookFors.length > 5) {
      problems.push({ path: [...path, "lookFors"], message: "Give 3 to 5 look-fors." });
    }
    if (duplicates(question.lookFors.map((l) => l.id)).length) problems.push({ path: [...path, "lookFors"], message: "Look-for ids must be unique." });
    if (question.type === "cv-deep-dive" && !question.rationale.cvQuote) {
      problems.push({ path: [...path, "rationale", "cvQuote"], message: "A cv-deep-dive question needs a CV quote." });
    }
    problems.push(...followUpProblems(question.followUps, [...path, "followUps"], stage === "review"));

    const slot = blueprint.slots[i];
    if (!slot || slot.questionId !== question.id || slot.type !== question.type || slot.competencyId !== question.competencyId || slot.focus !== question.focus) {
      problems.push({ path: ["blueprint", "slots", i], message: "Must match the question at the same position." });
    }

    if (stage === "review") {
      if (countWords(question.text) > limits.questionMaxWords) {
        problems.push({ path: [...path, "text"], message: `Must be at most ${limits.questionMaxWords} words.`, lengthRule: "question-words" });
      }
      if (!isSingleQuestion(question.text)) problems.push({ path: [...path, "text"], message: "Must be one question with a single question mark at the end." });
      if (!isSpeakable(question.text)) problems.push({ path: [...path, "text"], message: "Must be speakable: no symbols or abbreviated units." });
      if (bannedTopicHits(question.text).length) problems.push({ path: [...path, "text"], message: "Touches a protected or personal topic." });
      if (!isVerbatim(question.rationale.jdQuote, context.jobDescription)) {
        problems.push({ path: [...path, "rationale", "jdQuote"], message: "Must be copied exactly from the job description." });
      }
      if (question.rationale.cvQuote && !isVerbatim(question.rationale.cvQuote, context.cv)) {
        problems.push({ path: [...path, "rationale", "cvQuote"], message: "Must be copied exactly from the CV." });
      }
    }
  });
  if (blueprint.slots.length !== questions.length) {
    problems.push({ path: ["blueprint", "slots"], message: "Give one blueprint slot per question." });
  }

  if (stage === "review") {
    const roleLevel = context.roleProfile.roleLevel;
    if (mixDistance(questions.map((q) => q.type), roleLevel) > 1) {
      problems.push({ path: ["questions"], message: "The mix of question types must be within one question of the level table." });
    }
    const anchored = questions.filter((q) => q.rationale.cvQuote).length;
    const neededAnchors = levelIndex(roleLevel) >= 3 ? 2 : 1;
    if (anchored < neededAnchors) {
      problems.push({ path: ["questions"], message: `At least ${neededAnchors} questions must be anchored to a CV quote.` });
    }
    const gaps = mustHaveGapIds(context.roleProfile, context.candidateProfile);
    if (gaps.length && !questions.some((q) => q.focus === "probe-gap" && gaps.includes(q.competencyId))) {
      problems.push({ path: ["questions"], message: "Include a probe-gap question on a weak must-have competency." });
    }
    if (isLevelBelow(context.candidateProfile.cvLevel, roleLevel) && !questions.some((q) => q.stretch)) {
      problems.push({ path: ["questions"], message: "Mark one question as the stretch question." });
    }
  }
  return problems;
}

export type EvaluationDraft = {
  lookForEvidence: { lookForId: string; status: "covered" | "partial" | "missing"; quote: string | null }[];
  errors: { claim: string; correction: string }[];
  accuracyConfidence: "high" | "medium" | "low";
  scores: { technicalAccuracy: number; depthOfReasoning: number; appliedEvidence: number; clarity: number };
  justifications: { technicalAccuracy: string; depthOfReasoning: string; appliedEvidence: string; clarity: string };
  strengths: string[];
  weaknesses: string[];
  improvement: string;
  strongerAnswerOutline: string[];
  followUpClosedGap: boolean | null;
};

export type EvaluationContext = {
  lookForIds: string[];
  mainAnswer: string;
  followUpAnswer: string | null;
  followUpAsked: boolean;
  /** Other text the feedback may quote: the role title and the question. */
  quotable?: string;
};

export function evaluationProblems(output: EvaluationDraft, context: EvaluationContext): Problem[] {
  const problems: Problem[] = [];
  const seen = output.lookForEvidence.map((e) => e.lookForId);
  if (seen.length !== context.lookForIds.length || context.lookForIds.some((id) => !seen.includes(id)) || duplicates(seen).length) {
    problems.push({ path: ["lookForEvidence"], message: "Give exactly one entry for each look-for." });
  }
  output.lookForEvidence.forEach((entry, i) => {
    const path = ["lookForEvidence", i, "quote"];
    if (entry.status === "missing") return;
    if (!entry.quote) {
      problems.push({ path, message: "A covered or partial look-for needs a quote from the answer." });
      return;
    }
    if (countWords(entry.quote) > limits.quoteMaxWords) {
      problems.push({ path, message: `Quote at most ${limits.quoteMaxWords} words.`, lengthRule: "quote-words" });
    }
    const inAnswer = isVerbatim(entry.quote, context.mainAnswer) || (context.followUpAnswer !== null && isVerbatim(entry.quote, context.followUpAnswer));
    if (!inAnswer) problems.push({ path, message: "Must be copied exactly from the candidate's answer." });
  });
  if (output.strengths.length > 2) problems.push({ path: ["strengths"], message: "Give at most 2 strengths." });
  if (output.weaknesses.length < 1 || output.weaknesses.length > 2) problems.push({ path: ["weaknesses"], message: "Give 1 or 2 weaknesses." });
  if (output.strongerAnswerOutline.length < 3 || output.strongerAnswerOutline.length > 5) {
    problems.push({ path: ["strongerAnswerOutline"], message: "Give 3 to 5 points." });
  }
  if (context.followUpAsked && output.followUpClosedGap === null) {
    problems.push({ path: ["followUpClosedGap"], message: "Say whether the follow-up closed the gap." });
  }
  if (!context.followUpAsked && output.followUpClosedGap !== null) {
    problems.push({ path: ["followUpClosedGap"], message: "Must be null when no follow-up was asked." });
  }
  const feedback = [
    ...output.strengths,
    ...output.weaknesses,
    output.improvement,
    ...output.strongerAnswerOutline,
    ...Object.values(output.justifications),
  ].join("\n");
  if (brandPhraseHits(feedback).length) problems.push({ path: ["strengths"], message: "Feedback uses a phrase the brand bans." });
  const quotable = [context.mainAnswer, context.followUpAnswer ?? "", context.quotable ?? ""].join("\n");
  if (usSpellingHits(feedback, quotable).length) problems.push({ path: ["strengths"], message: "Use UK spelling in the feedback." });
  if (genericFeedbackHits([...output.strengths, ...output.weaknesses, output.improvement].join("\n")).length) {
    problems.push({ path: ["strengths"], message: "Feedback must be specific to this answer: no generic praise or advice." });
  }
  if (sentenceCount(output.improvement) > limits.improvementMaxSentences || countWords(output.improvement) > limits.improvementMaxWords) {
    problems.push({
      path: ["improvement"],
      message: `Give one specific action in at most ${limits.improvementMaxSentences} sentences and ${limits.improvementMaxWords} words.`,
      lengthRule: "improvement-length",
    });
  }
  return problems;
}

export type ReportDraft = {
  verdict: string;
  priorities: { title: string; detail: string }[];
  levelGapNote: string | null;
  uncertaintyNotes: { questionId: string; note: string }[];
};

export type ReportContext = {
  levelGap: boolean;
  lowConfidenceIds: string[];
  /** Text the report may quote: the role, the questions and the candidate's answers. */
  quotable?: string;
};

export function reportProblems(output: ReportDraft, context: ReportContext): Problem[] {
  const problems: Problem[] = [];
  if (output.priorities.length !== 3) problems.push({ path: ["priorities"], message: "Give exactly 3 priorities." });
  if (context.levelGap && !output.levelGapNote) problems.push({ path: ["levelGapNote"], message: "Write the level gap note." });
  if (!context.levelGap && output.levelGapNote) problems.push({ path: ["levelGapNote"], message: "Must be null: there is no level gap." });
  const noted = output.uncertaintyNotes.map((n) => n.questionId);
  if (noted.length !== context.lowConfidenceIds.length || context.lowConfidenceIds.some((id) => !noted.includes(id))) {
    problems.push({ path: ["uncertaintyNotes"], message: "Write one note for each low-confidence question, and no others." });
  }
  const text = [output.verdict, output.levelGapNote ?? "", ...output.priorities.flatMap((p) => [p.title, p.detail]), ...output.uncertaintyNotes.map((n) => n.note)].join("\n");
  if (brandPhraseHits(text).length) problems.push({ path: ["verdict"], message: "The report uses a phrase the brand bans." });
  if (usSpellingHits(text, context.quotable).length) problems.push({ path: ["verdict"], message: "Use UK spelling in the report." });
  if (genericFeedbackHits(output.priorities.flatMap((p) => [p.title, p.detail]).join("\n")).length) {
    problems.push({ path: ["priorities"], message: "Priorities must be specific to this job and these answers: no generic advice." });
  }
  // The voice never puts "redundant" in a heading, and each priority title is shown as one.
  if (output.priorities.some((p) => /redundan/i.test(p.title))) {
    problems.push({ path: ["priorities"], message: 'Never use "redundant" in a priority title.' });
  }
  return problems;
}

/** What the model writes for one suggested answer (#205). The code adds the question id and copies the CV lines. */
export type SuggestionDraft = {
  kind: "evidence" | "gap";
  points: { lookForId: string; text: string; evidenceLineIds: string[] }[];
  sampleAnswer: string;
  honestLine: string | null;
  followUpTips: { followUpId: string; tip: string }[];
  uncertainty: string | null;
};

export type SuggestionContext = {
  question: TechnicalInterviewQuestion;
  role: RoleProfile;
  candidate: CandidateProfile;
  /** The CV as numbered lines (cvEvidenceLines). */
  lines: CvLine[];
  cv: string;
  jobDescription: string;
};

/** True when the analysis found nothing in the CV for the question's competency, so its suggested answer is a gap. */
export function hasNoCvEvidence(question: TechnicalInterviewQuestion, candidate: CandidateProfile): boolean {
  const evidence = candidate.evidence.find((e) => e.competencyId === question.competencyId);
  const gap = candidate.gaps.find((g) => g.competencyId === question.competencyId);
  return !evidence || evidence.cvQuote === null || gap?.evidence === "none";
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True when a text names a term as a whole word or phrase, so "Git" is not found in "digital". "R" must match case. */
export function mentions(text: string, term: string): boolean {
  const trimmed = term.trim();
  if (!trimmed) return false;
  const pattern = escapeRegExp(trimmed).replace(/\s+/g, "\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, trimmed.length <= 2 ? "u" : "iu").test(text);
}

/** The tools, methods and standards the job ad names that the CV never mentions. */
export function namedItemsAbsentFromCv(role: RoleProfile, cv: string): string[] {
  return [...new Set(role.namedItems.map((item) => item.text.trim()))].filter((item) => item && !mentions(cv, item));
}

const firstPerson = /\b(?:I|[Mm]e|[Mm]y|[Ww]e|[Oo]ur|[Uu]s)\b/;
/** The candidate in their own answer (I, we) or in advice to them (you): points and tips speak to the candidate. */
const aboutTheCandidate = /\b(?:I|[Mm]e|[Mm]y|[Ww]e|[Oo]ur|[Uu]s|[Yy]ou|[Yy]our)\b/;
/** What the candidate would do, not what they did: "I'd…", "we would…", "you would…", or a sentence that opens with "If". */
const hypothetical = /\b(?:I|we|you)(?:['’]d|['’]ll| would| will| might)\b|^\s*if\b/i;

function figures(text: string): string[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((figure) => figure.replace(/,/g, "").replace(/\.0+$/, ""));
}

/** A sentence that says what the candidate did, not what they would do. */
function isClaim(sentence: string): boolean {
  return aboutTheCandidate.test(sentence) && !hypothetical.test(sentence);
}

/**
 * Figures in sentences about what the candidate did that appear in none of the sources. [Placeholders] are skipped,
 * and so is what they would do ("I'd compare 60 out of 400"); "I cut errors by 20 per cent, so the team could trust
 * it" is not. For a problem-solving question, pass its text as `workingFrom`: a sentence that uses its figures is
 * working on the question ("so I get 800 kilograms of dry solids from the 1,000"), not a claim about the past.
 */
export function inventedFigures(text: string, sources: string, workingFrom = ""): string[] {
  const known = new Set(figures(sources));
  const given = new Set(figures(workingFrom));
  return splitSentences(text.replace(/\[[^\]]*\]/g, " "))
    .filter((sentence) => isClaim(sentence) && !figures(sentence).some((figure) => given.has(figure)))
    .flatMap((sentence) => figures(sentence).filter((figure) => !known.has(figure)));
}

/** An honest line says what the candidate has not done: "I haven't…", "not yet", "I'm new to…". */
const honestWording = /\b(?:not|never|no|yet|new to)\b|n['’]t\b/i;

/** Every rule a suggested answer must pass (#205). Messages name the rule, never the CV, job ad or answer text. */
export function suggestionProblems(output: SuggestionDraft, context: SuggestionContext): Problem[] {
  const problems: Problem[] = [];
  const { question } = context;

  // R2: one point per look-for, so the answer is built against the rubric that scores it.
  const lookForIds = question.lookFors.map((l) => l.id);
  const pointIds = output.points.map((p) => p.lookForId);
  if (pointIds.length !== lookForIds.length || lookForIds.some((id) => !pointIds.includes(id)) || duplicates(pointIds).length) {
    problems.push({ path: ["points"], message: "Give exactly one point for each look-for." });
  }
  // R1: evidence by line id only; the code copies the lines.
  const lineIds = new Set(context.lines.map((line) => line.id));
  output.points.forEach((point, i) => {
    const path = ["points", i, "evidenceLineIds"];
    if (point.evidenceLineIds.length > 2) problems.push({ path, message: "Cite at most 2 CV lines for a point." });
    if (point.evidenceLineIds.some((id) => !lineIds.has(id))) problems.push({ path, message: "Cite only line ids listed in the CV." });
  });
  if (output.kind === "evidence" && output.points.every((p) => p.evidenceLineIds.length === 0)) {
    problems.push({ path: ["points"], message: "An evidence answer must cite at least one CV line." });
  }
  const plannedIds = question.followUps.map((f) => f.id);
  const tipIds = output.followUpTips.map((t) => t.followUpId);
  if (tipIds.length !== plannedIds.length || plannedIds.some((id) => !tipIds.includes(id)) || duplicates(tipIds).length) {
    problems.push({ path: ["followUpTips"], message: "Give exactly one tip for each planned follow-up." });
  }

  // R5 and R6: a gap is said plainly, never hidden.
  if (hasNoCvEvidence(question, context.candidate) && output.kind !== "gap") {
    problems.push({ path: ["kind"], message: 'The CV shows no evidence for this competency: set kind to "gap".' });
  }
  if (output.kind === "gap" && output.honestLine === null) problems.push({ path: ["honestLine"], message: "A gap answer needs an honest line." });
  const honest = output.honestLine ?? "";
  if (output.honestLine !== null) {
    if (!isVerbatim(honest, output.sampleAnswer)) problems.push({ path: ["honestLine"], message: "Put the honest line word for word in the sample answer." });
    if (!honestWording.test(honest)) problems.push({ path: ["honestLine"], message: "The honest line must say plainly what the CV does not show." });
  }

  // R4: a tool, method or regulation the CV never names is never claimed. It may appear in the honest line, in what the
  // candidate would do ("In Power BI I'd…") and in plain facts about it ("DSEAR needs the area zoned"), never in what they did.
  const answerOutsideHonest = honest ? splitSentences(output.sampleAnswer).filter((sentence) => !isVerbatim(honest, sentence)) : splitSentences(output.sampleAnswer);
  const elsewhere = [...answerOutsideHonest, ...[...output.points.map((p) => p.text), ...output.followUpTips.map((t) => t.tip), output.uncertainty ?? ""].flatMap(splitSentences)];
  const claimed = namedItemsAbsentFromCv(context.role, context.cv).filter((item) => elsewhere.some((sentence) => mentions(sentence, item) && isClaim(sentence)));
  if (claimed.length) {
    problems.push({
      path: ["sampleAnswer"],
      message: "Claims a tool or method from the job ad that the CV never mentions: use it only in what the candidate would do, and say plainly in honestLine that they have not used it.",
    });
  }

  // R3: a figure about what the candidate did comes from the CV, the job ad or the question.
  const sources = [context.cv, context.jobDescription, question.text, ...question.lookFors.map((l) => l.text), ...question.followUps.map((f) => f.text)].join("\n");
  const written = [output.sampleAnswer, ...output.points.map((p) => p.text), ...output.followUpTips.map((t) => t.tip)];
  const workingFrom = question.type === "problem-solving" ? question.text : "";
  if (written.some((text) => inventedFigures(text, sources, workingFrom).length > 0)) {
    problems.push({ path: ["sampleAnswer"], message: "A figure about what the candidate did is not in the CV, the job ad or the question: use a [placeholder]." });
  }

  // R7: the voice, and nothing personal about the candidate.
  const all = [...written, honest, output.uncertainty ?? ""].join("\n");
  const quotable = [context.cv, context.jobDescription, question.text, ...context.role.namedItems.map((item) => item.text)].join("\n");
  if (brandPhraseHits(all).length) problems.push({ path: ["sampleAnswer"], message: "Uses a phrase the brand bans." });
  if (usSpellingHits(all, quotable).length) problems.push({ path: ["sampleAnswer"], message: "Use UK spelling." });
  const sourceTopics = bannedTopicHits(quotable);
  const personal = written.flatMap((text) => splitSentences(text).filter((sentence) => firstPerson.test(sentence))).flatMap((sentence) => bannedTopicHits(sentence));
  if (personal.some((term) => !sourceTopics.includes(term))) problems.push({ path: ["sampleAnswer"], message: "Touches a protected or personal topic." });
  // A line id in the text is a citation leaking out, unless the CV or job ad itself says it ("BTEC L3 Diploma").
  if (context.lines.some((line) => mentions(all, line.id) && !mentions(quotable, line.id))) {
    problems.push({ path: ["sampleAnswer"], message: "Never write line ids in the text: they belong in evidenceLineIds." });
  }

  // R8: over the soft limit a sample answer is kept and recorded; over the hard cap it is rejected.
  const words = countWords(output.sampleAnswer);
  const lengthMessage = `Keep the sample answer to ${limits.suggestedAnswerMaxWords} words.`;
  if (words > limits.suggestedAnswerHardMaxWords) problems.push({ path: ["sampleAnswer"], message: lengthMessage });
  else if (words > limits.suggestedAnswerMaxWords) problems.push({ path: ["sampleAnswer"], message: lengthMessage, lengthRule: "sample-answer-words" });
  const shortTexts = [...output.points.map((p) => p.text), ...output.followUpTips.map((t) => t.tip), honest, output.uncertainty ?? ""];
  if (shortTexts.some((text) => countWords(text) > limits.suggestionTextMaxWords)) {
    problems.push({ path: ["points"], message: `Keep each point, tip, honest line and uncertainty to ${limits.suggestionTextMaxWords} words.` });
  }
  return problems;
}
