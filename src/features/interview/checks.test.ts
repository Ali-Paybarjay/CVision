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
  repairReviewedSet,
} from "./engine/checks";
import { reviewOutputSchema } from "./engine/schemas";
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

  it("matches quotes when the source or the quote hides invisible characters", () => {
    const source = "Led a team​ of five­ engineers across two‮ sites.";
    expect(isVerbatim("led a team of five engineers across two sites", source)).toBe(true);
    expect(isVerbatim("led a﻿ team of five", "Led a team of five engineers.")).toBe(true);
    expect(isVerbatim("led a team of six", source)).toBe(false);
  });

  it("recognises non-answers but not honest attempts", () => {
    expect(isNonAnswer("")).toBe(true);
    expect(isNonAnswer("I don't know.")).toBe(true);
    expect(isNonAnswer("Sorry, no idea")).toBe(true);
    expect(isNonAnswer("I don't know, but here is how I would find out: I would ask the lab.")).toBe(false);
  });
});

describe("analysis checks", () => {
  it("requires every must-have competency with no CV evidence to be listed as a gap", async () => {
    const { analysisProblems } = await import("./engine/checks");
    const fixture = fixtures[0];
    const context = questionSetContextFor(fixture);
    const mustHave = fixture.analyse.roleProfile.competencies.find((c) => c.priority === "must-have" && !fixture.analyse.candidateProfile.gaps.some((g) => g.competencyId === c.id))!;
    const output = {
      ...fixture.analyse,
      candidateProfile: {
        ...fixture.analyse.candidateProfile,
        evidence: fixture.analyse.candidateProfile.evidence.map((e) => (e.competencyId === mustHave.id ? { ...e, cvQuote: null, estimatedLevel: null } : e)),
      },
    };
    expect(analysisProblems(output, context.jobDescription, context.cv).map((p) => p.message)).toContain(
      "A must-have competency with no CV evidence must be listed in gaps.",
    );
  });
});

describe("repairing a reviewed set that breaks a review rule (#220)", () => {
  const fixture = fixtures[0];
  const context = questionSetContextFor(fixture);
  const clean = fixture.review;
  // One question of the set changed, the rest as reviewed.
  const withQuestion = (i: number, change: (q: (typeof clean.questions)[number]) => (typeof clean.questions)[number]) => ({
    ...clean,
    questions: clean.questions.map((q, j) => (j === i ? change(q) : q)),
  });
  const symbolFollowUp = (q: (typeof clean.questions)[number], j: number) => ({
    ...q,
    followUps: q.followUps.map((f, k) => (k === j ? { ...f, text: "Which CI/CD step would you check first?" } : f)),
  });

  it("keeps a clean set as it is", () => {
    expect(repairReviewedSet(clean, clean, context)).toEqual({ set: clean, broken: [], restored: [] });
  });

  it("drops a follow-up with a symbol and keeps the rest of the question", () => {
    const reviewed = withQuestion(4, (q) => symbolFollowUp(q, 0));
    const repair = repairReviewedSet(reviewed, clean, context);
    expect(repair.broken).toEqual(["follow-up-speakable"]);
    expect(repair.restored).toEqual([]);
    expect(repair.set?.questions[4].followUps).toEqual(clean.questions[4].followUps.slice(1));
    expect(repair.set && questionSetProblems(repair.set, context, "review").filter((p) => p.reviewRule)).toEqual([]);
  });

  const noCleanFollowUp = (q: (typeof clean.questions)[number]) => q.followUps.reduce((acc, _, j) => symbolFollowUp(acc, j), q);

  it("puts a question back as it was before the review when none of its follow-ups is left", () => {
    const repair = repairReviewedSet(withQuestion(2, noCleanFollowUp), clean, context);
    expect(repair.restored).toEqual(["q3"]);
    expect(repair.set?.questions[2]).toEqual(clean.questions[2]);
    expect(repair.set?.blueprint.slots[2]).toEqual(clean.blueprint.slots[2]);
  });

  it("gives up only when the version from before the review cannot be used either", () => {
    const broken = withQuestion(2, noCleanFollowUp);
    const repair = repairReviewedSet(broken, broken, context);
    expect(repair.set).toBeNull();
    expect(repair.broken.every((rule) => rule === "follow-up-speakable")).toBe(true);
  });

  it("lets the schema pass repairable rules, but sends a question's own text and protected topics back to the model", () => {
    const schema = reviewOutputSchema(context);
    expect(schema.safeParse(withQuestion(4, (q) => symbolFollowUp(q, 0))).success).toBe(true);
    // The model's retry fixes these better than the code can (eval of 30 Oct).
    expect(schema.safeParse(withQuestion(1, (q) => ({ ...q, text: "Which query would you write? And why?" }))).success).toBe(false);
    const personal = withQuestion(4, (q) => ({ ...q, followUps: q.followUps.map((f, k) => (k === 0 ? { ...f, text: "What is your age?" } : f)) }));
    expect(schema.safeParse(personal).success).toBe(false);
  });
});
