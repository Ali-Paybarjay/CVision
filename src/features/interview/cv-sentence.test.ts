// The CV sentence shown under a question (#252): the whole sentence the question is written from, only while the CV
// still holds it, and only when the question does not already say it.
import { describe, expect, it } from "vitest";
import { quotedCvSentence } from "./engine/text";
import { dataAnalystSara as fixture } from "./fixtures/data-analyst-sara";
import { inputsFor } from "./test-support";

const cv = inputsFor(fixture).cv;
const question = "Tell me about the data you cleaned in your last role. What went wrong, and how did you find it?";

describe("the CV sentence under a question", () => {
  it("shows the whole sentence that holds the quote, word for word from the CV", () => {
    expect(quotedCvSentence("joined weekly sales data from 120 stores", cv, question)).toBe(
      "Cleaned and joined weekly sales data from 120 stores using SQL and Python",
    );
  });

  it("matches the quote as the other quote checks do: case, curly quotes and edge marks aside", () => {
    expect(quotedCvSentence("“…JOINED weekly sales data from 120 stores.”", cv, question)).toBe(
      "Cleaned and joined weekly sales data from 120 stores using SQL and Python",
    );
  });

  it("shows nothing when the question already says the sentence word for word", () => {
    const q1 = fixture.review.questions.find((q) => q.id === "q1")!;
    expect(quotedCvSentence(q1.rationale.cvQuote ?? undefined, cv, q1.text)).toBeNull();
  });

  it("shows nothing when the profile no longer holds the quote", () => {
    const edited = cv.replace("from 120 stores", "from 140 stores");
    expect(quotedCvSentence("joined weekly sales data from 120 stores", edited, question)).toBeNull();
  });

  it("shows nothing for a question with no CV quote", () => {
    expect(quotedCvSentence(undefined, cv, question)).toBeNull();
  });

  it("shows the quote itself when it runs across two sentences", () => {
    const twoSentences = "Led the stock count. Cut the time it took by half.";
    expect(quotedCvSentence("Led the stock count. Cut the time", `Summary\n${twoSentences}`, question)).toBe("Led the stock count. Cut the time");
  });
});
