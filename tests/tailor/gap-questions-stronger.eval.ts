// Live prompt eval for the five gap questions, "Make it stronger" included (pilot, 7 Nov): real requests, so they cost money.
// Run with `npm run eval`, or from Actions → eval with tests/tailor/gap-questions-stronger.eval.ts.
// Fictional people and ads only (gap-questions.cases.ts). Each case asks the model once and prints its questions.
import { beforeAll, describe, expect, it } from "vitest";
import { askGapQuestions, questionGaps, skillGaps, type GapQuestion } from "@/features/tailor";
import { getAiProvider } from "@/shared/ai";
import { gapCases } from "./gap-questions.cases";

const words = (text: string) => text.trim().split(/\s+/).length;
const has = (text: string, list: string[]) => list.some((item) => new RegExp(`\\b${item.replace(/[.*+?^${}()|[\]\\&]/g, "\\$&")}`, "i").test(text));
const conditions = /\b(licen[cs]e|right to work|visa|travel|relocat\w*|working hours|hours a week|salary|pay)\b/i;

describe.skipIf(!getAiProvider())("Gap questions (live)", () => {
  describe.each(gapCases)("$name", ({ name, input, names, terms, neverClaims }) => {
    let questions: GapQuestion[] = [];

    beforeAll(async () => {
      const started = Date.now();
      questions = await askGapQuestions(input);
      const source = (id: string) => (skillGaps(input.match.gaps).some((gap) => gap.id === id) ? "A" : "B");
      console.log(`${name}: ${questions.length} questions in ${((Date.now() - started) / 1000).toFixed(1)} s`);
      for (const item of questions) console.log(`  [${source(item.gapId)}] ${item.question}\n      ${(item.options ?? []).join("\n      ")}`);
    }, 180_000);

    it("writes short questions and short options, with no No option", () => {
      expect(questions.length).toBeGreaterThan(0);
      for (const item of questions) {
        expect(words(item.question), item.question).toBeLessThanOrEqual(20);
        for (const option of item.options ?? []) {
          expect(words(option), option).toBeLessThanOrEqual(15);
          expect(option, option).not.toMatch(/^no\b/i);
        }
      }
    });

    it("never asks about a condition of the job", () => {
      for (const item of questions) expect(item.question, item.question).not.toMatch(conditions);
    });

    it("asks at most one question per gap, and only about known gaps", () => {
      const ids = questions.map((item) => item.gapId);
      expect(new Set(ids).size).toBe(ids.length);
      const known = questionGaps(input.job, input.match).map((gap) => gap.id);
      for (const id of ids) expect(known).toContain(id);
    });

    if (neverClaims) {
      it("offers no answer that claims work the CV does not show", () => {
        for (const option of questions.flatMap((item) => item.options ?? [])) expect(option, option).not.toMatch(neverClaims);
      });
    }

    if (name.startsWith("(a)")) {
      it("asks five questions, each tied to their own work, at least two in their field's words", () => {
        expect(questions).toHaveLength(5);
        for (const item of questions) expect(has(item.question, names), item.question).toBe(true);
        expect(questions.filter((item) => has(item.question, terms)).length).toBeGreaterThanOrEqual(2);
      });
    }
  });
});
