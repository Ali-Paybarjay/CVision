// The seven stages of the technical interview engine. Each loads its prompt, calls askModel, checks the answer
// against the stage's schema (askModel retries once, then fails clearly) and records what it used.
// Length rules are checked after the reply: a reply that breaks one is kept and recorded as interview.length_over.
// The review's repairable rules too: the code repairs the item and records interview.review_rule_broken (#220).
import "server-only";
import { askModel, AskModelError, getAiMode, loadPrompt, type ModelUsage, type Requester } from "@/shared/ai";
import { track } from "@/shared/analytics/track";
import {
  answerGuide,
  defaultComposition,
  levelDescriptions,
  levelMix,
  stageConfig,
  type StageName,
  type StageSettings,
} from "../config";
import type {
  AnswerEvaluation,
  AnswerSuggestion,
  FollowUpDecision,
  InterviewReport,
  InterviewSession,
  RoleProfile,
  StageUsage,
  TechnicalInterviewQuestion,
} from "../contracts";
import { rubricFor, appliedEvidenceByType } from "../rubrics";
import {
  bannedTopicHits,
  evaluationProblems,
  hasNoCvEvidence,
  isCleanFollowUp,
  isLevelBelow,
  isSpeakable,
  namedItemsAbsentFromCv,
  questionSetProblems,
  repairReviewedSet,
  retryRuleName,
  suggestionProblems,
  type DraftQuestion,
  type EvaluationContext,
  type Problem,
  type QuestionSetContext,
  type SuggestionContext,
} from "./checks";
import { fixtureOrPlaceholder, mockEvaluation, mockFollowUpDecision, mockReport, mockSuggestion, requireFixture } from "./mock";
import {
  analyseOutputSchema,
  evaluateOutputSchema,
  generateOutputSchema,
  reportOutputSchema,
  reviewOutputSchema,
  suggestOutputSchema,
  FollowUpOutputSchema,
  type AnalyseOutput,
  type EvaluateOutput,
  type FollowUpOutput,
  type GenerateOutput,
  type ReportOutput,
  type ReviewOutput,
  type SuggestOutput,
  type InterviewInputs,
} from "./schemas";
import { competencyMap, questionOverall, readinessFor, sessionOverall } from "./scoring";
import {
  applyAnalysis,
  applyQuestions,
  createSession,
  decisionFor,
  followUpAnswer,
  followUpQuestion,
  mainAnswer,
  suggestionFor,
  technicalQuestions,
  unansweredQuestionIds,
  type Provenance,
} from "./session";
import { cvEvidenceLines, isNonAnswer, neutraliseTags, wrapUntrusted } from "./text";
import { estimateUsage, measuredUsage } from "./usage";

/** Overrides for one stage's settings, used by the eval to compare models. */
export type StageOverrides = Partial<Record<StageName, Partial<StageSettings>>>;

/** How a stage runs: setting overrides for the eval, and who is asking, for askModel's daily limits. */
export type StageRun = { overrides?: StageOverrides; requester?: Requester };

export class InterviewStageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InterviewStageError";
  }
}

/** askModel adds its own short JSON instructions to the system prompt; this approximates their length. */
const askModelInstructionsChars = 200;

function settingsFor(stage: StageName, overrides?: StageOverrides): StageSettings {
  return { ...stageConfig[stage], ...overrides?.[stage] };
}

/** Reads prompts/<name>.md, fills its placeholders, and splits off the front matter (the version is recorded, not sent). */
export async function loadInterviewPrompt(name: string, values: Record<string, string>): Promise<{ text: string; version: string }> {
  const raw = await loadPrompt(name, values);
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  const version = match?.[1].match(/^version:\s*(.+)$/m)?.[1].trim();
  if (!match || !version) throw new InterviewStageError(`prompts/${name}.md has no version in its front matter.`);
  return { text: raw.slice(match[0].length).trim(), version };
}

/** JSON for a prompt block, with any of our tags inside the data neutralised. */
function data(value: unknown): string {
  return neutraliseTags(JSON.stringify(value, null, 2));
}

export const lengthOverEvent = "interview.length_over";
export const reviewRuleEvent = "interview.review_rule_broken";
export const reviewRejectedEvent = "interview.review_rejected";

/** What the user sees when the questions cannot be written, instead of the rule that failed (#220). */
// Often shown after the page has already sent the stage once more by itself (#232), so it does not promise that a second go works.
export const questionsNotWritten = "We could not finish writing your questions this time. Try again in a moment.";

/**
 * Records each rule a reply breaks (one that is kept, or for the review one that is sent back), by stage and rule
 * name only, never the text. The event is stored only for a signed-in user's live request, so mock runs and the
 * eval leave the events table alone.
 */
async function recordRules(event: string, stage: StageName, rules: string[], requester?: Requester): Promise<void> {
  const counts = new Map<string, number>();
  for (const rule of rules) counts.set(rule, (counts.get(rule) ?? 0) + 1);
  for (const [rule, count] of counts) {
    console.info(`${event}: ${stage} ${rule} x${count}`);
    if (requester) await track(event, { stage, rule, count }, requester);
  }
}

function lengthRules(problems: Problem[]): string[] {
  return problems.flatMap((p) => (p.lengthRule ? [p.lengthRule] : []));
}

async function callStage<T>(options: {
  stage: StageName;
  values: Record<string, string>;
  schema: Parameters<typeof askModel>[0]["schema"];
  sample: unknown;
  voice: boolean;
  run: StageRun;
  questionId?: string;
  /** The stage's checks, run again on the kept reply to find the soft length rules it breaks. */
  problems?: (output: T) => Problem[];
  /** Collects what each live request used, so a caller can still record it when askModel throws. */
  reports?: ModelUsage[];
}): Promise<{ output: T; usage: StageUsage; provenance: Provenance }> {
  const settings = settingsFor(options.stage, options.run.overrides);
  const reports = options.reports ?? [];
  const prompt = await loadInterviewPrompt(settings.prompt, options.values);
  const output = (await askModel({
    feature: settings.prompt,
    prompt: prompt.text,
    schema: options.schema,
    sample: options.sample as never,
    voice: options.voice,
    model: settings.model,
    effort: settings.effort,
    maxTokens: settings.maxTokens,
    requester: options.run.requester,
    onUsage: (used) => {
      reports.push(used);
    },
  })) as T;
  await recordRules(lengthOverEvent, options.stage, lengthRules(options.problems?.(output) ?? []), options.run.requester);
  // Live requests report their real tokens, thinking and any retry included; mock mode has nothing to report.
  const usage =
    reports.length > 0
      ? measuredUsage({ stage: options.stage, model: settings.model, reports, questionId: options.questionId })
      : estimateUsage({
          stage: options.stage,
          model: settings.model,
          input: prompt.text + (options.voice ? await loadPrompt("_voice") : ""),
          extraInputChars: askModelInstructionsChars,
          output,
          questionId: options.questionId,
        });
  return { output, usage, provenance: { stage: options.stage, prompt: settings.prompt, version: prompt.version, model: settings.model } };
}

function isMock(): boolean {
  return getAiMode() === "mock";
}

function sampleFixture(jobId: string) {
  return isMock() ? requireFixture(jobId) : fixtureOrPlaceholder(jobId);
}

/** Stage 1: analyse the role and the candidate. Creates the session. */
export async function analyseStep(inputs: InterviewInputs, options: { id: string; startedAt: string } & StageRun): Promise<InterviewSession> {
  const fixture = sampleFixture(inputs.jobId);
  const { output, usage, provenance } = await callStage<AnalyseOutput>({
    stage: "analyse",
    values: {
      job_description: neutraliseTags(inputs.jobDescription),
      parsed_requirements: neutraliseTags(inputs.parsedRequirements ?? "None"),
      cv: neutraliseTags(inputs.cv),
    },
    schema: analyseOutputSchema(inputs.jobDescription, inputs.cv),
    sample: fixture.analyse,
    voice: false,
    run: options,
  });
  const session = createSession({ id: options.id, jobId: inputs.jobId, startedAt: options.startedAt, mode: getAiMode() });
  return applyAnalysis(session, { ...output, composition: defaultComposition }, usage, provenance);
}

function questionSetContext(session: InterviewSession, inputs: InterviewInputs): QuestionSetContext {
  if (!session.roleProfile || !session.candidateProfile || !session.plan) {
    throw new InterviewStageError("The session has not been analysed yet.");
  }
  if (session.plan.composition.behavioural > 0) {
    throw new InterviewStageError("Behavioural questions arrive in stage 2; this engine writes technical questions only.");
  }
  return {
    roleProfile: session.roleProfile,
    candidateProfile: session.candidateProfile,
    jobDescription: inputs.jobDescription,
    cv: inputs.cv,
    count: session.plan.composition.technical,
  };
}

function levelPlanValues(context: QuestionSetContext): Record<string, string> {
  const level = context.roleProfile.roleLevel;
  const mix = Object.entries(levelMix[level])
    .map(([type, n]) => `${type} ${n}`)
    .join(", ");
  const gap = isLevelBelow(context.candidateProfile.cvLevel, level)
    ? `The CV shows ${context.candidateProfile.cvLevel}, below the role's ${level}. Keep the bar at ${level} and mark exactly one question as the stretch question (stretch: true).`
    : "There is no level gap: set stretch to false on every question.";
  return {
    role_profile: data(context.roleProfile),
    candidate_profile: data(context.candidateProfile),
    job_description: neutraliseTags(context.jobDescription),
    cv: neutraliseTags(context.cv),
    role_level: level,
    level_description: levelDescriptions[level],
    level_mix: mix,
    level_gap: gap,
    question_count: String(context.count),
  };
}

/** Adds the fields the code owns: the original `kind`, the category, the role's level and the answer guide. */
export function toTechnicalQuestion(draft: DraftQuestion, context: QuestionSetContext): TechnicalInterviewQuestion {
  return {
    id: draft.id,
    kind: draft.type === "problem-solving" ? "problem-solving" : "technical",
    text: draft.text,
    category: "technical",
    type: draft.type,
    competencyId: draft.competencyId,
    focus: draft.focus,
    level: context.roleProfile.roleLevel,
    stretch: draft.stretch,
    rationale: {
      jdQuote: draft.rationale.jdQuote,
      ...(draft.rationale.cvQuote ? { cvQuote: draft.rationale.cvQuote } : {}),
      why: draft.rationale.why,
    },
    lookFors: draft.lookFors,
    anchors: draft.anchors,
    redFlags: draft.redFlags,
    followUps: draft.followUps,
    answerGuide,
  };
}

function toDraft(question: TechnicalInterviewQuestion): DraftQuestion {
  return {
    id: question.id,
    type: question.type,
    competencyId: question.competencyId,
    focus: question.focus,
    stretch: question.stretch,
    text: question.text,
    rationale: { jdQuote: question.rationale.jdQuote, cvQuote: question.rationale.cvQuote ?? null, why: question.rationale.why },
    lookFors: question.lookFors,
    anchors: question.anchors,
    redFlags: question.redFlags,
    followUps: question.followUps,
  };
}

/** Stage 2: blueprint and questions. */
export async function generateStep(session: InterviewSession, inputs: InterviewInputs, run: StageRun = {}): Promise<InterviewSession> {
  const context = questionSetContext(session, inputs);
  const { output, usage, provenance } = await callStage<GenerateOutput>({
    stage: "generate",
    values: levelPlanValues(context),
    schema: generateOutputSchema(context),
    sample: sampleFixture(session.jobId).generate,
    voice: false,
    run,
  });
  const questions = output.questions.map((q) => toTechnicalQuestion(q, context));
  return applyQuestions(session, { blueprint: output.blueprint, questions }, usage, provenance);
}

/** Stage 3: a separate call reviews the whole set and rewrites what fails the checklist. */
export async function reviewStep(session: InterviewSession, inputs: InterviewInputs, run: StageRun = {}): Promise<InterviewSession> {
  const context = questionSetContext(session, inputs);
  if (!session.blueprint || session.questions.length === 0) throw new InterviewStageError("There are no questions to review yet.");
  // The rules of each answer sent back to the model, recorded whether the retry passes or the step fails.
  const rejected: string[] = [];
  const { output, usage, provenance } = await callStage<ReviewOutput>({
    stage: "review",
    values: {
      ...levelPlanValues(context),
      blueprint: data(session.blueprint),
      questions: data(technicalQuestions(session).map(toDraft)),
    },
    schema: reviewOutputSchema(context, (problems) => rejected.push(...problems.map(retryRuleName))),
    sample: sampleFixture(session.jobId).review,
    voice: false,
    run,
  }).finally(() => recordRules(reviewRejectedEvent, "review", rejected, run.requester));
  const before = { blueprint: session.blueprint, questions: technicalQuestions(session).map(toDraft) };
  const repair = repairReviewedSet(output, before, context);
  await recordRules(reviewRuleEvent, "review", repair.broken, run.requester);
  if (!repair.set) throw new InterviewStageError(questionsNotWritten);
  const kept = repair.set;
  await recordRules(lengthOverEvent, "review", lengthRules(questionSetProblems(kept, context, "review")), run.requester);
  const questions = kept.questions.map((q) => toTechnicalQuestion(q, context));
  // A question put back as it was before the review no longer has the review's changes.
  const changelog = kept.changelog.filter((change) => !repair.restored.includes(change.questionId));
  return applyQuestions(session, { blueprint: kept.blueprint, questions, changelog }, usage, provenance);
}

/** Stages 1 to 3 back to back, for the eval. The page calls them one by one to show progress. */
export async function runStartup(
  inputs: InterviewInputs,
  options: { id: string; startedAt: string; onProgress?: (stage: "analyse" | "generate" | "review") => void } & StageRun,
): Promise<InterviewSession> {
  options.onProgress?.("analyse");
  let session = await analyseStep(inputs, options);
  options.onProgress?.("generate");
  session = await generateStep(session, inputs, options);
  options.onProgress?.("review");
  return reviewStep(session, inputs, options);
}

function findQuestion(session: InterviewSession, questionId: string): TechnicalInterviewQuestion {
  const question = technicalQuestions(session).find((q) => q.id === questionId);
  if (!question) throw new InterviewStageError(`Unknown question ${questionId}.`);
  return question;
}

/** Turns the model's decision into a FollowUpDecision, using the planned text whenever the model's text is unusable. */
export function settleFollowUp(question: TechnicalInterviewQuestion, output: FollowUpOutput | null): FollowUpDecision {
  const planned = question.followUps;
  if (!output) {
    const fallback = planned.find((f) => f.gapType === "missing-specifics") ?? planned[0];
    return {
      questionId: question.id,
      askFollowUp: true,
      gapType: fallback.gapType,
      plannedFollowUpId: fallback.id,
      followUpText: fallback.text,
      usedFallback: true,
      reason: "The model's decision was not valid, so the planned follow-up was asked.",
    };
  }
  if (!output.askFollowUp || output.gapType === "none") {
    return { questionId: question.id, askFollowUp: false, gapType: "none", usedFallback: false, reason: output.reason };
  }
  const byId = planned.find((f) => f.id === output.plannedFollowUpId);
  const chosen = byId ?? planned.find((f) => f.gapType === output.gapType) ?? planned[0];
  const text = output.followUpText?.trim() ?? "";
  const textOk = isCleanFollowUp(text) && isSpeakable(text) && bannedTopicHits(text).length === 0;
  // The record stays consistent: the gap type is always the chosen planned follow-up's.
  const consistent = Boolean(byId) && chosen.gapType === output.gapType;
  return {
    questionId: question.id,
    askFollowUp: true,
    gapType: chosen.gapType,
    plannedFollowUpId: chosen.id,
    followUpText: textOk && consistent ? text : chosen.text,
    usedFallback: !(textOk && consistent),
    reason: output.reason,
  };
}

/**
 * Stage 4: whether to ask a follow-up after the main answer. Never more than one per question: once a decision
 * exists the model is not called again. Never fails: an invalid answer from the model falls back to the planned text.
 */
export async function decideFollowUp(
  session: InterviewSession,
  questionId: string,
  run: StageRun = {},
): Promise<{ decision: FollowUpDecision; usage?: StageUsage; provenance?: Provenance }> {
  const question = findQuestion(session, questionId);
  const existing = decisionFor(session, questionId);
  if (existing) return { decision: existing };
  if (followUpQuestion(session, questionId) !== null) {
    return { decision: { questionId, askFollowUp: false, gapType: "none", usedFallback: false, reason: "This question has already had its one follow-up." } };
  }
  const main = mainAnswer(session, questionId);
  if (main === null) throw new InterviewStageError(`${questionId} has no answer yet.`);
  if (isNonAnswer(main)) {
    return { decision: { questionId, askFollowUp: false, gapType: "none", usedFallback: false, reason: "No genuine attempt to answer, so the interview moves on." } };
  }

  const followUpValues = {
    question: neutraliseTags(question.text),
    look_fors: data(question.lookFors),
    planned_follow_ups: data(question.followUps),
    candidate_answer: neutraliseTags(main),
  };
  const reports: ModelUsage[] = [];
  try {
    const { output, usage, provenance } = await callStage<FollowUpOutput>({
      stage: "followUp",
      values: followUpValues,
      schema: FollowUpOutputSchema,
      sample: mockFollowUpDecision(question, session.jobId, main),
      voice: false,
      run,
      questionId,
      reports,
    });
    return { decision: settleFollowUp(question, output), usage, provenance };
  } catch (error) {
    // Logs the kind of failure only, never the answer text.
    console.error(`interview follow-up: falling back to the planned text (${error instanceof Error ? error.name : "unknown error"})`);
    const decision = settleFollowUp(question, null);
    if (reports.length === 0) return { decision };
    // The model answered but its answers were rejected: record what that cost and which prompt ran.
    const settings = settingsFor("followUp", run.overrides);
    const prompt = await loadInterviewPrompt(settings.prompt, followUpValues).catch(() => null);
    if (!prompt) return { decision };
    const usage = measuredUsage({ stage: "followUp", model: settings.model, reports, questionId });
    return { decision, usage, provenance: { stage: "followUp", prompt: settings.prompt, version: prompt.version, model: settings.model } };
  }
}

/** The answer (and any follow-up) as the evaluate prompt sees it, each answer inside <candidate_answer>. */
export function buildTranscript(session: InterviewSession, questionId: string): string {
  const parts = [wrapUntrusted("candidate_answer", mainAnswer(session, questionId) ?? "", 'turn="main"')];
  const followUp = followUpQuestion(session, questionId);
  if (followUp !== null) {
    parts.push(`The interviewer then asked this follow-up: ${neutraliseTags(followUp)}`);
    parts.push(wrapUntrusted("candidate_answer", followUpAnswer(session, questionId) ?? "", 'turn="follow-up"'));
  } else {
    parts.push("No follow-up was asked.");
  }
  return parts.join("\n\n");
}

/** Stage 5: scores one question on its own, with no access to the other answers. */
export async function evaluateAnswer(
  session: InterviewSession,
  questionId: string,
  run: StageRun = {},
): Promise<{ evaluation: AnswerEvaluation; usage: StageUsage; provenance: Provenance }> {
  const question = findQuestion(session, questionId);
  const role = session.roleProfile;
  if (!role) throw new InterviewStageError("The session has not been analysed yet.");
  const main = mainAnswer(session, questionId);
  if (main === null) throw new InterviewStageError(`${questionId} has no answer yet.`);
  if (unansweredQuestionIds(session).includes(questionId)) throw new InterviewStageError(`${questionId} was not answered, so it gets a suggested answer instead.`);
  const asked = followUpQuestion(session, questionId) !== null;
  const followUp = followUpAnswer(session, questionId);
  if (asked && followUp === null) throw new InterviewStageError(`${questionId} is waiting for its follow-up answer.`);

  const rubric = rubricFor(question.category);
  const evaluationContext: EvaluationContext = {
    lookForIds: question.lookFors.map((l) => l.id),
    mainAnswer: main,
    followUpAnswer: followUp,
    followUpAsked: asked,
    // The job ad's own tools and standards may keep their US spelling when the model quotes them.
    quotable: [role.title, role.discipline, question.text, ...role.namedItems.map((item) => item.text)].join("\n"),
  };
  const { output, usage, provenance } = await callStage<EvaluateOutput>({
    stage: "evaluate",
    values: {
      role_title: neutraliseTags(role.title),
      role_discipline: neutraliseTags(role.discipline),
      role_level: role.roleLevel,
      level_description: levelDescriptions[role.roleLevel],
      question: data({ text: question.text, type: question.type, lookFors: question.lookFors, anchors: question.anchors, redFlags: question.redFlags }),
      rubric: rubric.dimensions.map((d) => `- ${d.key} (${d.label}): 1 = ${d.anchors.score1}; 3 = ${d.anchors.score3}; 5 = ${d.anchors.score5}`).join("\n"),
      applied_evidence: appliedEvidenceByType[question.type],
      transcript: buildTranscript(session, questionId),
    },
    schema: evaluateOutputSchema(evaluationContext),
    problems: (value) => evaluationProblems(value, evaluationContext),
    sample: mockEvaluation(session, question),
    voice: true,
    run,
    questionId,
  });

  const evaluation: AnswerEvaluation = {
    questionId,
    rubricId: "technical-v1",
    scores: output.scores,
    overall: questionOverall(output.scores),
    lookForEvidence: output.lookForEvidence.map((entry) => ({
      lookForId: entry.lookForId,
      status: entry.status,
      ...(entry.quote ? { quote: entry.quote } : {}),
    })),
    errors: output.errors,
    accuracyConfidence: output.accuracyConfidence,
    justifications: output.justifications,
    strengths: output.strengths,
    weaknesses: output.weaknesses,
    improvement: output.improvement,
    strongerAnswerOutline: output.strongerAnswerOutline,
    ...(output.followUpClosedGap === null ? {} : { followUpClosedGap: output.followUpClosedGap }),
  };
  return { evaluation, usage, provenance };
}

/** What the report sees and may quote: the role, the questions and every answer. */
function reportQuotable(session: InterviewSession, role: RoleProfile): string {
  return [JSON.stringify(role), ...session.questions.map((q) => q.text), ...session.answers.map((a) => a.text)].join("\n");
}

/** Stage 6: the report. Numbers come from code; the model writes the verdict, priorities and notes. */
export async function writeReport(
  session: InterviewSession,
  run: StageRun = {},
): Promise<{ report: InterviewReport; usage: StageUsage; provenance: Provenance }> {
  const role = session.roleProfile;
  const candidate = session.candidateProfile;
  if (!role || !candidate) throw new InterviewStageError("The session has not been analysed yet.");
  if (session.endedAt) throw new InterviewStageError("A practice ended early has no overall report.");
  const evaluations = session.evaluations ?? [];
  const missing = session.questions.filter((q) => !evaluations.some((e) => e.questionId === q.id));
  if (session.questions.length === 0 || missing.length) throw new InterviewStageError("Every question must be scored before the report.");

  const ordered = session.questions.map((q) => evaluations.find((e) => e.questionId === q.id) as AnswerEvaluation);
  const overall = sessionOverall(ordered);
  const readiness = readinessFor(overall);
  const map = competencyMap(role, session.questions, ordered);
  const levelGap = isLevelBelow(candidate.cvLevel, role.roleLevel);
  const lowConfidenceIds = ordered.filter((e) => e.accuracyConfidence === "low").map((e) => e.questionId);

  const results = {
    overall,
    readiness,
    competencyMap: map.map((entry) => ({ ...entry, name: role.competencies.find((c) => c.id === entry.competencyId)?.name })),
    lowConfidenceQuestionIds: lowConfidenceIds,
    questions: technicalQuestions(session).map((q, i) => {
      const e = ordered[i];
      return {
        id: q.id,
        type: q.type,
        competencyId: q.competencyId,
        text: q.text,
        overall: e.overall,
        scores: e.scores,
        accuracyConfidence: e.accuracyConfidence,
        errors: e.errors,
        weaknesses: e.weaknesses,
        improvement: e.improvement,
      };
    }),
  };

  const { output, usage, provenance } = await callStage<ReportOutput>({
    stage: "report",
    values: {
      role_profile: data(role),
      results: data(results),
      level_gap: levelGap
        ? `The CV shows ${candidate.cvLevel}, below the role's level of ${role.roleLevel}. Write the levelGapNote.`
        : `No level gap: the CV shows ${candidate.cvLevel} and the role is ${role.roleLevel}. Set levelGapNote to null.`,
    },
    schema: reportOutputSchema({ levelGap, lowConfidenceIds, quotable: reportQuotable(session, role) }),
    sample: mockReport(session, { overall, readiness, levelGap, lowConfidenceIds }),
    voice: true,
    run,
  });

  const report: InterviewReport = {
    overall,
    readiness,
    verdict: output.verdict,
    competencyMap: map,
    priorities: output.priorities,
    levelGapNote: output.levelGapNote,
    uncertaintyNotes: output.uncertaintyNotes,
  };
  return { report, usage, provenance };
}

export const suggestionFallbackEvent = "interview.suggestion_fallback";

/** What the suggestion checks need for one question (#205). */
export function suggestionContext(
  session: InterviewSession,
  questionId: string,
  inputs: Pick<InterviewInputs, "cv" | "jobDescription">,
): SuggestionContext {
  const role = session.roleProfile;
  const candidate = session.candidateProfile;
  if (!role || !candidate) throw new InterviewStageError("The session has not been analysed yet.");
  return { question: findQuestion(session, questionId), role, candidate, lines: cvEvidenceLines(inputs.cv), cv: inputs.cv, jobDescription: inputs.jobDescription };
}

/** The model's suggestion as stored: points in the look-fors' order, each cited CV line copied word for word by the code. */
export function toSuggestion(output: SuggestOutput, context: SuggestionContext): AnswerSuggestion {
  const lineText = new Map(context.lines.map((line) => [line.id, line.text]));
  const planned = new Set(context.question.followUps.map((f) => f.id));
  return {
    questionId: context.question.id,
    kind: output.kind,
    points: context.question.lookFors.flatMap((lookFor) => {
      const point = output.points.find((p) => p.lookForId === lookFor.id);
      if (!point) return [];
      return [{ lookForId: lookFor.id, text: point.text, evidence: [...new Set(point.evidenceLineIds)].flatMap((id) => lineText.get(id) ?? []) }];
    }),
    sampleAnswer: output.sampleAnswer,
    honestLine: output.honestLine,
    followUpTips: output.followUpTips.filter((tip) => planned.has(tip.followUpId)),
    uncertainty: output.uncertainty,
    fallback: false,
  };
}

/**
 * The safe version when the model's suggestion cannot be used, built by the code from the reviewed question: its
 * look-fors as the points and the analysis's CV quote as the evidence, with no sample answer.
 */
export function fallbackSuggestion(context: SuggestionContext): AnswerSuggestion {
  const { question, candidate } = context;
  const quote = question.rationale.cvQuote ?? candidate.evidence.find((e) => e.competencyId === question.competencyId)?.cvQuote ?? null;
  return {
    questionId: question.id,
    kind: hasNoCvEvidence(question, candidate) ? "gap" : "evidence",
    points: question.lookFors.map((lookFor, i) => ({ lookForId: lookFor.id, text: lookFor.text, evidence: i === 0 && quote ? [quote] : [] })),
    sampleAnswer: null,
    honestLine: null,
    followUpTips: [],
    uncertainty: null,
    fallback: true,
  };
}

/** Failures that get the code-built suggestion. Any other error (no key, a network failure) is thrown, so the page offers "Try again". */
const fallbackReasons: ReadonlySet<string> = new Set(["invalid-answer", "refused", "limit-reached"]);

/**
 * Stage 7 (#205): a suggested answer, built from the candidate's CV, for one question left unanswered after "End here".
 * One request per question: the checks are schema refinements, so askModel's one retry re-asks only this question,
 * and if the retry still breaks a rule the question gets the code-built version instead.
 */
export async function suggestAnswer(
  session: InterviewSession,
  questionId: string,
  inputs: Pick<InterviewInputs, "cv" | "jobDescription">,
  run: StageRun = {},
): Promise<{ suggestion: AnswerSuggestion; usage?: StageUsage; provenance?: Provenance; requests?: number }> {
  const existing = suggestionFor(session, questionId);
  if (existing) return { suggestion: existing };
  if (!session.endedAt) throw new InterviewStageError("The practice has not ended, so there is nothing to suggest yet.");
  if (!unansweredQuestionIds(session).includes(questionId)) throw new InterviewStageError(`${questionId} was answered, so it gets feedback instead.`);
  const context = suggestionContext(session, questionId, inputs);
  const sample = mockSuggestion(session.jobId, questionId);
  if (isMock() && !sample) return { suggestion: fallbackSuggestion(context) };

  const { question, role, candidate } = context;
  const values = {
    role: data({
      title: role.title,
      discipline: role.discipline,
      sector: role.sector,
      level: role.roleLevel,
      levelDescription: levelDescriptions[role.roleLevel],
      namedItemsNotInCv: namedItemsAbsentFromCv(role, inputs.cv),
    }),
    question: data({
      id: question.id,
      text: question.text,
      type: question.type,
      focus: question.focus,
      competency: role.competencies.find((c) => c.id === question.competencyId) ?? null,
      jdQuote: question.rationale.jdQuote,
      cvQuote: question.rationale.cvQuote ?? null,
      lookFors: question.lookFors.map(({ id, text }) => ({ id, text })),
      plannedFollowUps: question.followUps.map(({ id, text }) => ({ id, text })),
    }),
    candidate_profile: data({
      cvLevel: candidate.cvLevel,
      evidence: candidate.evidence.find((e) => e.competencyId === question.competencyId) ?? null,
      gap: candidate.gaps.find((g) => g.competencyId === question.competencyId) ?? null,
      claimsToProbe: candidate.claimsToProbe,
    }),
    cv: neutraliseTags(context.lines.map((line) => `${line.id}: ${line.text}`).join("\n")),
    job_description: neutraliseTags(inputs.jobDescription),
    kind_rule: hasNoCvEvidence(question, candidate)
      ? 'The CV shows no evidence for this competency, so set kind to "gap".'
      : 'Choose the kind from the CV lines: "evidence" if they show this competency, "gap" if they do not.',
  };
  const reports: ModelUsage[] = [];
  try {
    const { output, usage, provenance } = await callStage<SuggestOutput>({
      stage: "suggest",
      values,
      schema: suggestOutputSchema(context),
      problems: (value) => suggestionProblems(value, context),
      // In live mode askModel ignores the sample.
      sample: sample ?? null,
      voice: true,
      run,
      questionId,
      reports,
    });
    // Live requests sent, the retry included; the eval logs it.
    return { suggestion: toSuggestion(output, context), usage, provenance, requests: reports.length };
  } catch (error) {
    if (!(error instanceof AskModelError) || !fallbackReasons.has(error.reason)) throw error;
    // The message names the broken rule and its field only: the checks never quote the CV or the model's text.
    console.error(`interview suggest: using the code-built suggestion for ${questionId} (${error.reason}: ${error.message})`);
    if (run.requester) await track(suggestionFallbackEvent, { questionType: question.type, focus: question.focus, reason: error.reason }, run.requester);
    const suggestion = fallbackSuggestion(context);
    const requests = reports.length;
    if (requests === 0) return { suggestion, requests };
    // The model answered but its answers were rejected: record what that cost and which prompt ran.
    const settings = settingsFor("suggest", run.overrides);
    const prompt = await loadInterviewPrompt(settings.prompt, values).catch(() => null);
    if (!prompt) return { suggestion, requests };
    const usage = measuredUsage({ stage: "suggest", model: settings.model, reports, questionId });
    return { suggestion, usage, provenance: { stage: "suggest", prompt: settings.prompt, version: prompt.version, model: settings.model }, requests };
  }
}
