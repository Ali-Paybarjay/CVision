import { describe, expect, it } from "vitest";
import { brand } from "@/shared/brand";
import { ProfileSchema, type Profile } from "@/shared/contracts";
import { personas } from "@/shared/sample-data";
import {
  findAnswer,
  FollowUpQuestionSchema,
  hasNumber,
  isMentioned,
  MAX_QUESTIONS,
  MIN_QUESTIONS,
  recordFollowUpAnswer,
  suggestFollowUpQuestions,
} from "./follow-up";

const sara = personas.sara.profile;

function profileWith(change: Partial<Profile>): Profile {
  return { ...sara, followUpAnswers: [], ...change };
}

describe("suggestFollowUpQuestions", () => {
  it.each(Object.keys(personas) as (keyof typeof personas)[])("writes 3 to 5 valid questions for %s", (name) => {
    const questions = suggestFollowUpQuestions(personas[name].profile);

    expect(questions.length).toBeGreaterThanOrEqual(MIN_QUESTIONS);
    expect(questions.length).toBeLessThanOrEqual(MAX_QUESTIONS);
    expect(new Set(questions.map((question) => question.id)).size).toBe(questions.length);
    for (const question of questions) {
      expect(() => FollowUpQuestionSchema.parse(question)).not.toThrow();
      for (const phrase of brand.bannedPhrases) {
        expect(`${question.question} ${question.reason}`.toLowerCase()).not.toContain(phrase.toLowerCase());
      }
    }
  });

  it("asks Sara for a result from her job without one, and for examples of unproven skills", () => {
    const questions = suggestFollowUpQuestions(sara);

    expect(questions.map((question) => [question.topic, question.about])).toEqual([
      ["role", "Customer Assistant (part-time) at Greenway Foods"],
      ["skill", "Excel"],
      ["skill", "R"],
      ["skill", "Statistics"],
    ]);
  });

  it("asks for the number behind an achievement that has none, first", () => {
    const profile = profileWith({
      experience: [{ ...sara.experience[0], achievements: ["Improved the weekly stock report"] }],
      skills: [],
    });

    const [first] = suggestFollowUpQuestions(profile);

    expect(first.topic).toBe("achievement");
    expect(first.about).toBe("Improved the weekly stock report");
    expect(first.question).toContain("Northgate Retail Insights");
  });

  it("does not ask a question the user has already answered", () => {
    const [first] = suggestFollowUpQuestions(sara);
    const answered = recordFollowUpAnswer(profileWith({}), first, "I trained four new starters on the tills.", {
      id: "a1",
      answeredAt: new Date("2026-10-20T10:00:00Z"),
    });

    expect(suggestFollowUpQuestions(answered).map((question) => question.question)).not.toContain(first.question);
  });

  it("falls back to general questions when the profile leaves little to ask", () => {
    const profile = profileWith({
      skills: ["SQL"],
      experience: [{ ...sara.experience[0], achievements: ["Cut report time from 4 hours to 30 minutes"] }],
    });

    const questions = suggestFollowUpQuestions(profile);

    expect(questions).toHaveLength(MIN_QUESTIONS);
    expect(questions.every((question) => question.topic === "general")).toBe(true);
  });
});

describe("hasNumber", () => {
  it.each([
    ["Cut stock loss from 2.1% to 1.3%", true],
    ["Managed a £15,000 budget", true],
    ["Trained four new starters", true],
    ["Top-rated advisor, three quarters running", true],
    ["Improved team morale", false],
  ])("%s → %s", (line, expected) => {
    expect(hasNumber(line)).toBe(expected);
  });
});

describe("isMentioned", () => {
  const evidence = "Cleaned sales data using SQL and Python. Led a team of nine. Statistical modelling in R.";

  it.each([
    ["Python (pandas)", true],
    ["SQL", true],
    ["Data cleaning", true],
    ["R", true],
    ["Statistics", true],
    ["Excel", false],
    ["Stakeholder communication", false],
  ])("%s → %s", (skill, expected) => {
    expect(isMentioned(skill, evidence)).toBe(expected);
  });

  it("matches a one-letter skill only as a whole word with the same capital", () => {
    expect(isMentioned("R", "Reported sales every week")).toBe(false);
    expect(isMentioned("C", "Wrote firmware in C for sensors")).toBe(true);
  });
});

describe("recordFollowUpAnswer", () => {
  const question = { question: "Where have you used Excel?" };
  const at = { id: "answer-1", answeredAt: new Date("2026-10-20T18:00:00Z") };

  it("keeps the answer word for word, trimming only the outer spaces", () => {
    const answer = "  Every Monday I built the stock sheet in Excel.\n\nIt used VLOOKUP and pivot tables.  ";

    const profile = recordFollowUpAnswer(profileWith({}), question, answer, at);

    expect(profile.followUpAnswers).toEqual([
      {
        id: "answer-1",
        question: "Where have you used Excel?",
        answer: "Every Monday I built the stock sheet in Excel.\n\nIt used VLOOKUP and pivot tables.",
        answeredAt: "2026-10-20T18:00:00.000Z",
      },
    ]);
    expect(() => ProfileSchema.parse(profile)).not.toThrow();
  });

  it("replaces an earlier answer to the same question", () => {
    const first = recordFollowUpAnswer(profileWith({}), question, "First answer", at);
    const second = recordFollowUpAnswer(first, question, "Better answer", { ...at, id: "answer-2" });

    expect(second.followUpAnswers).toHaveLength(1);
    expect(findAnswer(second, question)?.answer).toBe("Better answer");
  });

  it("refuses an empty answer", () => {
    expect(() => recordFollowUpAnswer(profileWith({}), question, "   ", at)).toThrow();
  });

  it("leaves the profile it was given unchanged", () => {
    const before = profileWith({});
    recordFollowUpAnswer(before, question, "An answer", at);
    expect(before.followUpAnswers).toEqual([]);
  });
});
