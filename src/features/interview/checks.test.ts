import { describe, expect, it } from "vitest";
import { levelMix } from "./config";
import {
  bannedTopicHits,
  isLevelBelow,
  isSingleQuestion,
  isSpeakable,
  mixDistance,
  mustHaveGapIds,
  questionSetProblems,
} from "./engine/checks";
import { countWords, isNonAnswer, isVerbatim } from "./engine/text";
import { fixtures } from "./fixtures";
import { questionSetContextFor } from "./test-support";

describe.each(fixtures)("blueprint rules on the final question set of $id", (fixture) => {
  const { questions, blueprint } = fixture.review;
  const role = fixture.analyse.roleProfile;
  const candidate = fixture.analyse.candidateProfile;
  const level = role.roleLevel;

  it("has exactly 6 questions", () => {
    expect(questions).toHaveLength(6);
  });

  it("has a mix within one question of the level table", () => {
    expect(mixDistance(questions.map((q) => q.type), level)).toBeLessThanOrEqual(1);
  });

  it("has enough CV-anchored questions for the level", () => {
    const anchored = questions.filter((q) => q.rationale.cvQuote).length;
    expect(anchored).toBeGreaterThanOrEqual(Number(level.slice(1)) >= 3 ? 2 : 1);
  });

  it("probes every weak must-have competency the CV shows", () => {
    const gaps = mustHaveGapIds(role, candidate);
    if (gaps.length) {
      expect(questions.some((q) => q.focus === "probe-gap" && gaps.includes(q.competencyId))).toBe(true);
    }
  });

  it("includes a stretch question when the CV is below the role's level", () => {
    if (isLevelBelow(candidate.cvLevel, level)) expect(questions.some((q) => q.stretch)).toBe(true);
  });

  it("only uses competency ids that exist", () => {
    const ids = role.competencies.map((c) => c.id);
    for (const q of questions) expect(ids).toContain(q.competencyId);
    for (const slot of blueprint.slots) expect(ids).toContain(slot.competencyId);
  });

  it.each(questions.map((q) => [q.id, q] as const))("%s has 3–5 look-fors and 2–3 follow-ups with distinct gap types", (_, q) => {
    expect(q.lookFors.length).toBeGreaterThanOrEqual(3);
    expect(q.lookFors.length).toBeLessThanOrEqual(5);
    expect(q.followUps.length).toBeGreaterThanOrEqual(2);
    expect(q.followUps.length).toBeLessThanOrEqual(3);
    expect(new Set(q.followUps.map((f) => f.gapType)).size).toBe(q.followUps.length);
  });

  it.each(questions.map((q) => [q.id, q] as const))("%s is at most 80 words with a single question mark", (_, q) => {
    expect(countWords(q.text)).toBeLessThanOrEqual(80);
    expect((q.text.match(/\?/g) ?? []).length).toBe(1);
  });

  it("passes every review check", () => {
    expect(questionSetProblems(fixture.review, questionSetContextFor(fixture), "review")).toEqual([]);
  });
});

describe("banned topics", () => {
  const texts = fixtures.flatMap((f) =>
    [...f.generate.questions, ...f.review.questions].flatMap((q) => [
      [`${f.id} ${q.id}`, q.text] as const,
      ...q.followUps.map((fu) => [`${f.id} ${fu.id}`, fu.text] as const),
    ]),
  );

  it.each(texts)("%s mentions no protected or personal topic", (_, text) => {
    expect(bannedTopicHits(text)).toEqual([]);
  });

  it.each(["What is your age?", "Are you married?", "Do you have children?", "Is English your first language?", "What is your nationality?", "Do you have a disability?"])(
    "catches %s",
    (text) => {
      expect(bannedTopicHits(text).length).toBeGreaterThan(0);
    },
  );

  it.each([
    "What happens to the voltage when the load doubles?",
    "Which agency staff would you brief first?",
    "Why was the leakage rate higher in average conditions?",
    "An operator disabled the interlock. What would you do?",
    "How would you work with the finance business partner?",
    "How would you test the asset for impairment?",
    "Why does the image look stretched?",
  ])("matches whole words only, so it does not flag: %s", (text) => {
    expect(bannedTopicHits(text)).toEqual([]);
  });
});

describe("question wording checks", () => {
  it("accepts one question and rejects two", () => {
    expect(isSingleQuestion("Why did the batch fail?")).toBe(true);
    expect(isSingleQuestion("Why did it fail? What did you change?")).toBe(false);
    expect(isSingleQuestion("Explain the failure.")).toBe(false);
  });

  it("rejects text that has to be seen rather than heard", () => {
    expect(isSpeakable("It handles 200 kilograms per hour. Why?")).toBe(true);
    expect(isSpeakable("It handles 200 kg/h. Why?")).toBe(false);
    expect(isSpeakable("If x = 2, what is y?")).toBe(false);
  });

  it("measures the mix against the level table", () => {
    const l3 = Object.entries(levelMix.L3).flatMap(([type, n]) => Array(n).fill(type));
    expect(mixDistance(l3, "L3")).toBe(0);
    expect(mixDistance(l3, "L4")).toBe(1);
  });
});

describe("text helpers", () => {
  it("matches quotes word for word, ignoring case, spacing and curly quotes", () => {
    const source = "I set the reflux ratio and the  cut points with the lab’s help.";
    expect(isVerbatim("set the reflux ratio and the cut points", source)).toBe(true);
    expect(isVerbatim("“the cut points with the lab's help.”", source)).toBe(true);
    expect(isVerbatim("set the reflux and the cut points", source)).toBe(false);
    expect(isVerbatim("", source)).toBe(false);
  });

  it("recognises non-answers but not honest attempts", () => {
    expect(isNonAnswer("")).toBe(true);
    expect(isNonAnswer("I don't know.")).toBe(true);
    expect(isNonAnswer("Sorry, no idea")).toBe(true);
    expect(isNonAnswer("I don't know, but here is how I would find out: I would ask the lab.")).toBe(false);
  });
});
