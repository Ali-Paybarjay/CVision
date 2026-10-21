import { describe, expect, it } from "vitest";
import { personas } from "@/shared/sample-data";
import { suggestFollowUpQuestions } from "../follow-up";
import { followUpPrompt, generateFollowUpQuestions } from "./generate-follow-up";

describe("generateFollowUpQuestions in mock mode", () => {
  it("answers with the rule-based questions, numbered q1, q2…", async () => {
    const profile = personas.daniel.profile;

    const questions = await generateFollowUpQuestions(profile);

    expect(questions).toEqual(suggestFollowUpQuestions(profile));
    expect(questions.map((question) => question.id)).toEqual(questions.map((_, index) => `q${index + 1}`));
  });
});

describe("followUpPrompt", () => {
  it("sends the experience but never the name or contact details", async () => {
    const profile = personas.sara.profile;

    const prompt = await followUpPrompt(profile);

    expect(prompt).toContain("Northgate Retail Insights");
    expect(prompt).toContain("Your CV lists Excel.");
    for (const personal of [profile.fullName, profile.contact.email, profile.contact.phone]) {
      expect(prompt).not.toContain(personal);
    }
  });
});
