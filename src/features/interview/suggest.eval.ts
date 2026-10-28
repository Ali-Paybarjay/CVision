// Live eval for suggested answers after "End here" (#205). Real requests, so it costs money (about a cent per
// fixture): run it from the Actions tab (eval workflow, file src/features/interview/suggest.eval.ts) or with
// `npm run eval` and ANTHROPIC_API_KEY or OPENROUTER_API_KEY set. Never part of CI.
//
// For each fixture every question is left unanswered and gets a suggestion, one request per question in parallel, as
// on the page. It reports the wait (the slowest question sets it), tokens, cost, the safe versions used, and per
// question the kind, the requests sent (2 means a retry), the sample answer's length and its placeholders. Unlike
// interview.eval.ts it also prints the suggestions in full: the fixtures are fictional and already in the repo, and
// the PR needs a person to read each one against the CV and check that nothing claims more than the CV says.
import { describe, expect, it } from "vitest";
import { getAiProvider } from "@/shared/ai";
import { hasNoCvEvidence } from "./engine/checks";
import { technicalQuestions } from "./engine/session";
import { suggestAnswer } from "./engine/stages";
import { countWords } from "./engine/text";
import { usageTotals } from "./engine/usage";
import { fixtures } from "./fixtures";
import { endedSessionFor, inputsFor } from "./test-support";

describe.skipIf(!getAiProvider())("suggested answers, live", () => {
  it.each(fixtures)(
    "$id",
    async (fixture) => {
      const inputs = inputsFor(fixture);
      const session = endedSessionFor(fixture, "live");
      const started = Date.now();
      const results = await Promise.all(
        technicalQuestions(session).map(async (question) => {
          const begun = Date.now();
          const result = await suggestAnswer(session, question.id, inputs);
          return { question, ...result, seconds: (Date.now() - begun) / 1000 };
        }),
      );
      const rows = results.map(({ question, suggestion, requests, seconds }) => ({
        id: question.id,
        type: question.type,
        focus: question.focus,
        kind: suggestion.kind,
        fallback: suggestion.fallback,
        requests: requests ?? 0,
        words: suggestion.sampleAnswer ? countWords(suggestion.sampleAnswer) : 0,
        placeholders: suggestion.sampleAnswer?.match(/\[[^\]]+\]/g)?.length ?? 0,
        citedLines: suggestion.points.reduce((sum, point) => sum + point.evidence.length, 0),
        seconds,
      }));
      const totals = usageTotals(results.flatMap((r) => (r.usage ? [r.usage] : [])));
      console.log(
        JSON.stringify(
          {
            fixture: fixture.id,
            totalSeconds: (Date.now() - started) / 1000,
            slowestSeconds: Math.max(...rows.map((r) => r.seconds)),
            fallbacks: rows.filter((r) => r.fallback).length,
            retried: rows.filter((r) => r.requests > 1).map((r) => r.id),
            ...totals,
            questions: rows,
          },
          null,
          2,
        ),
      );
      for (const { question, suggestion } of results) {
        const points = suggestion.points.map((p) => `- ${p.text}${p.evidence.length ? `\n  From the CV: ${p.evidence.join(" | ")}` : ""}`);
        const honest = suggestion.honestLine ? `\nHonest line: ${suggestion.honestLine}` : "";
        console.log(`\n--- ${fixture.id} ${question.id}, ${suggestion.kind}${suggestion.fallback ? ", safe version" : ""}\n${question.text}\n\n${suggestion.sampleAnswer ?? "(no sample answer)"}${honest}\n${points.join("\n")}`);
      }

      expect(results).toHaveLength(session.questions.length);
      // A competency the CV never shows comes back as a gap, whichever way the suggestion was made.
      for (const { question, suggestion } of results) {
        if (hasNoCvEvidence(question, session.candidateProfile!)) expect(suggestion.kind, question.id).toBe("gap");
      }
      expect(rows.filter((r) => r.fallback).length).toBeLessThanOrEqual(1);
    },
    10 * 60 * 1000,
  );
});
