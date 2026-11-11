import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LetterParagraphCard } from "@/app/tailor/letter-paragraph-card";
import type { LetterParagraph } from "@/features/tailor/letter-state";

const card = (paragraph: LetterParagraph) =>
  renderToStaticMarkup(<LetterParagraphCard paragraph={paragraph} number={2} total={3} onChange={() => {}} />);

describe("a paragraph of the cover letter", () => {
  it("waits for Keep, Remove or Edit", () => {
    const html = card({ text: "I took minutes at the monthly team meeting.", decision: "pending" });
    expect(html).toContain("Paragraph 2 of 3");
    expect(html).toContain(">Keep<");
    expect(html).toContain(">Remove<");
    expect(html).toContain(">Edit<");
    expect(html).toContain("Waiting for your decision");
  });

  it("shows a removed paragraph struck through", () => {
    const html = card({ text: "I took minutes.", decision: "removed" });
    expect(html).toMatch(/line-through[^>]*>I took minutes\.</);
    expect(html).toContain("✕ Removed");
  });
});
