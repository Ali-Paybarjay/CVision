// Live eval for the technical interview engine. Real requests, so it costs money: run it by hand with
// `npm run eval` and ANTHROPIC_API_KEY set. Never part of CI. Prints numbers and ids only, never CV, job or answer text.
//
// For each fixture it reports: start-up time (stages 1 to 3), the spread of each scoring dimension when every
// sample answer is scored three times (target: 1 point or less), and estimated tokens and cost per session.
// Set INTERVIEW_EVAL_REVIEW_MODEL=claude-opus-5-5 to run stage 3 on Opus and compare it with Sonnet.
import { describe, expect, it } from "vitest";
import type { TechnicalScores } from "./contracts";
import { addAnswer, applyFollowUpDecision, askQuestion } from "./engine/session";
import { decideFollowUp, evaluateAnswer, runStartup, writeReport, type StageOverrides } from "./engine/stages";
import { usageTotals } from "./engine/usage";
import { fixtures } from "./fixtures";
import { inputsFor } from "./test-support";

const runs = 3;
const overrides: StageOverrides = process.env.INTERVIEW_EVAL_REVIEW_MODEL ? { review: { model: process.env.INTERVIEW_EVAL_REVIEW_MODEL } } : {};
const at = () => new Date().toISOString();

describe.skipIf(!process.env.ANTHROPIC_API_KEY)("technical interview engine, live", () => {
  it.each(fixtures)(
    "$id",
    async (fixture) => {
      const inputs = inputsFor(fixture);
      const started = Date.now();
      let session = await runStartup(inputs, { id: `eval-${fixture.id}`, startedAt: at(), overrides });
      const startupSeconds = (Date.now() - started) / 1000;

      // Answer the live questions with the fixture's sample answers, by position.
      const spreads: Record<string, Record<keyof TechnicalScores, number>> = {};
      for (const [index, question] of session.questions.entries()) {
        const sample = Object.values(fixture.answers)[index];
        session = askQuestion(session, question.id, at(), `${question.id}-ask`);
        session = addAnswer(session, { questionId: question.id, kind: "main", text: sample.main, startedAt: at(), submittedAt: at(), id: `${question.id}-a` });
        const { decision, usage, provenance } = await decideFollowUp(session, question.id, overrides);
        session = applyFollowUpDecision(session, decision, at(), `${question.id}-fu`, usage, provenance);
        if (decision.askFollowUp) {
          session = addAnswer(session, {
            questionId: question.id,
            kind: "follow-up",
            text: sample.followUp ?? "I would need to check that before answering.",
            startedAt: at(),
            submittedAt: at(),
            id: `${question.id}-fa`,
          });
        }

        const scores: TechnicalScores[] = [];
        for (let run = 0; run < runs; run++) {
          const result = await evaluateAnswer(session, question.id, overrides);
          scores.push(result.evaluation.scores);
          if (run === 0) session = { ...session, evaluations: [...(session.evaluations ?? []), result.evaluation], usage: [...(session.usage ?? []), result.usage] };
        }
        spreads[question.id] = Object.fromEntries(
          (Object.keys(scores[0]) as (keyof TechnicalScores)[]).map((key) => [key, Math.max(...scores.map((s) => s[key])) - Math.min(...scores.map((s) => s[key]))]),
        ) as Record<keyof TechnicalScores, number>;
      }

      const report = await writeReport(session, overrides);
      const usage = [...(session.usage ?? []), report.usage];
      // A session scores each answer once; the extra eval runs are left out of the per-session figure.
      const totals = usageTotals(usage);
      const worstSpread = Math.max(...Object.values(spreads).flatMap((s) => Object.values(s)));

      console.log(
        JSON.stringify(
          {
            fixture: fixture.id,
            reviewModel: overrides.review?.model ?? "default",
            startupSeconds,
            startupOverSixtySeconds: startupSeconds > 60,
            spreadByQuestion: spreads,
            worstSpread,
            followUpsAsked: (session.followUpDecisions ?? []).filter((d) => d.askFollowUp).length,
            fallbacksUsed: (session.followUpDecisions ?? []).filter((d) => d.usedFallback).length,
            readiness: report.report.readiness,
            estimatedSessionTokens: { input: totals.inputTokens, output: totals.outputTokens },
            estimatedSessionCostUsd: totals.costUsd,
          },
          null,
          2,
        ),
      );
      expect(worstSpread).toBeLessThanOrEqual(1);
    },
    30 * 60_000,
  );
});
