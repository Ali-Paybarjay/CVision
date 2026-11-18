// The cover letter panel says what the check took out of the letter (#466), and what the letter is written from (#500).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CoverLetterPanel } from "@/app/tailor/cover-letter-panel";
import type { GapAnswer } from "@/features/tailor/types";
import type { TailoringChange } from "@/shared/contracts";
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

const coral = (html: string) => html.match(/bg-cta/g) ?? [];

describe("the cover letter's one Coral button (#500)", () => {
  it("is Write my cover letter before there is a letter", () => {
    const html = renderToStaticMarkup(
      <CoverLetterPanel jobId="j" profile={personas.sara.profile} changes={[]} answers={[]} letter={null} setLetter={() => {}} />,
    );
    expect(coral(html)).toHaveLength(1);
    expect(html).toMatch(/<button[^>]*bg-cta[^>]*>Write my cover letter<\/button>/);
  });

  it("is Approve cover letter once there is one, with Write it again plain beside it", () => {
    const html = panel(false);
    expect(coral(html)).toHaveLength(1);
    expect(html).toMatch(/<button[^>]*bg-cta[^>]*>Approve cover letter<\/button>/);
    expect(html).not.toMatch(/<button[^>]*bg-cta[^>]*>Write it again<\/button>/);
  });
});

const approved = (id: string): TailoringChange => ({
  id,
  jobId: "j",
  section: "skills",
  before: null,
  after: `Skill ${id}`,
  evidence: "From the CV.",
  evidenceSource: "cv",
  status: "approved",
});
const answer: GapAnswer = { gapId: "g", question: "Have you used Power BI?", answer: "I built dashboards.", hasExperience: true };
const sentence = (changes: TailoringChange[], answers: GapAnswer[]) =>
  renderToStaticMarkup(<CoverLetterPanel jobId="j" profile={personas.sara.profile} changes={changes} answers={answers} letter={null} setLetter={() => {}} />);

describe("what the letter is written from (#500)", () => {
  it("names only the CV when nothing was approved or answered", () => {
    const html = sentence([], []);
    expect(html).toContain("Written only from your CV. Keep, remove or edit each paragraph");
    expect(html).not.toContain("0 changes");
    expect(html).not.toContain("your own answers");
  });

  it("names the answers without the changes when none was approved", () => {
    expect(sentence([], [answer])).toContain("Written only from your CV and your own answers.");
  });

  it("names the approved changes without answers, one change in the singular", () => {
    expect(sentence([approved("a"), approved("b")], [])).toContain("Written only from your CV and the 2 changes you approved.");
    expect(sentence([approved("a")], [])).toContain("Written only from your CV and the 1 change you approved.");
  });

  it("keeps the whole sentence when there are both", () => {
    expect(sentence([approved("a"), approved("b")], [answer])).toContain("Written only from your CV, the 2 changes you approved and your own answers.");
  });
});

describe("the top of the letter on a phone (#500)", () => {
  it("puts each contact detail on its own line, with the | only on a wider screen", () => {
    const html = panel(false);
    expect(html).toContain('<span class="hidden sm:inline"> | </span>');
    expect(html).toContain('<span class="block sm:inline">07700 900101</span>');
    expect(html).not.toContain("07700 900101 |");
  });
});

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
