// The cover letter panel says what the check took out of the letter (#466).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CoverLetterPanel } from "@/app/tailor/cover-letter-panel";
import { personas } from "@/shared/sample-data";

vi.mock("@/features/tailor/actions", () => ({ createCoverLetter: vi.fn() }));

const note = "We took out 1 sentence saying you hold “NMC”, which your CV and answers do not show. If you do, add it to your profile and write the letter again.";
const panel = (withNote: boolean) =>
  renderToStaticMarkup(
    <CoverLetterPanel
      jobId="j"
      profile={personas.sara.profile}
      changes={[]}
      answers={[]}
      letter={{ text: "Dear Hiring Manager,\n\nI am applying for the role.\n\nYours sincerely,\n\nSara Khan", approved: false, ...(withNote ? { note } : {}) }}
      setLetter={() => {}}
    />,
  );

describe("the cover letter panel (#466)", () => {
  it("shows the note about sentences taken out", () => {
    const html = panel(true);
    expect(html).toContain("We took out 1 sentence saying you hold");
    expect(html).toContain("which your CV and answers do not show. If you do, add it to your profile and write the letter again.");
  });

  it("shows no note when nothing was taken out", () => {
    expect(panel(false)).not.toContain("We took out");
  });
});
