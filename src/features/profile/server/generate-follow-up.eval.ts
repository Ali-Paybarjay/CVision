import { describe, expect, it } from "vitest";
import { brand } from "@/shared/brand";
import { personas, type PersonaName } from "@/shared/sample-data";
import { MAX_QUESTIONS, MIN_QUESTIONS } from "../follow-up";
import { generateFollowUpQuestions } from "./generate-follow-up";

// Prompt evals for prompts/profile-follow-up.md: real requests to the model, so they cost money.
// Run with `npm run eval` (needs ANTHROPIC_API_KEY).

/** Personal characteristics the questions must never ask about (Equality Act 2010 and plain respect). */
const PERSONAL = /\b(how old|your age|date of birth|health|disab\w*|religio\w*|nationality|pregnan\w*|married|children|ethnic\w*|sexual\w*)\b/i;

describe.skipIf(!process.env.ANTHROPIC_API_KEY)("profile-follow-up on the personas", () => {
  it.each(Object.keys(personas) as PersonaName[])("%s gets 3 to 5 focused, respectful questions", async (name) => {
    const profile = personas[name].profile;

    const questions = await generateFollowUpQuestions(profile);

    expect(questions.length).toBeGreaterThanOrEqual(MIN_QUESTIONS);
    expect(questions.length).toBeLessThanOrEqual(MAX_QUESTIONS);
    for (const { question, reason, topic, about } of questions) {
      expect(question.split(/\s+/).length, question).toBeLessThanOrEqual(40);
      expect(question, question).not.toMatch(PERSONAL);
      for (const phrase of brand.bannedPhrases) {
        expect(`${question} ${reason}`.toLowerCase()).not.toContain(phrase.toLowerCase());
      }
      if (topic === "skill") {
        expect(profile.skills.map((skill) => skill.toLowerCase()), `unknown skill "${about}"`).toContain(about.toLowerCase());
      }
      if (topic === "role") {
        expect(profile.experience.map((job) => `${job.title} at ${job.company}`.toLowerCase())).toContain(about.toLowerCase());
      }
    }
  });
});
