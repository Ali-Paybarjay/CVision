import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DownloadBar } from "@/app/tailor/download-bar";
import type { LetterState } from "@/features/tailor/letter-state";

vi.mock("@/features/tailor/actions", () => ({ exportDocument: vi.fn() }));

const bar = (letter: LetterState | null) =>
  renderToStaticMarkup(<DownloadBar jobId="j" changes={[]} letter={letter} onGoToLetter={() => {}} />);

/** The classes of the button whose text is `name`. */
const classesOf = (html: string, name: string) => {
  const escaped = name.replace(/[()]/g, "\\$&");
  return html.match(new RegExp(`<button [^>]*class="([^"]*)"[^>]*>${escaped}</button>`))?.[1];
};

describe("the downloads put PDF first and Word under it as links (#498)", () => {
  it("shows the CV as PDF, then Word as a link, before the letter is approved", () => {
    const html = bar(null);
    expect(html.indexOf("Download CV (PDF)")).toBeGreaterThan(-1);
    expect(html.indexOf("Download CV (PDF)")).toBeLessThan(html.indexOf("Download CV (Word)"));
    expect(html).toContain("Approve your cover letter to download it");
    expect(html).not.toContain("Download letter");
    expect(classesOf(html, "Download CV (PDF)")).toContain("border-accent");
    // The class itself, not a substring: the quiet button's own `hover:underline` must not pass for it.
    expect(classesOf(html, "Download CV (Word)")?.split(" ")).toContain("underline");
    expect(classesOf(html, "Download CV (Word)")).not.toContain("border-accent");
    expect(html).not.toContain("bg-cta");
  });

  it("shows both PDFs before both Word links once the letter is approved", () => {
    const html = bar({ text: "Dear Hiring Manager", approved: true });
    const pdfs = ["Download CV (PDF)", "Download letter (PDF)"].map((name) => html.indexOf(name));
    const words = ["Download CV (Word)", "Download letter (Word)"].map((name) => html.indexOf(name));
    for (const index of [...pdfs, ...words]) expect(index).toBeGreaterThan(-1);
    expect(Math.max(...pdfs)).toBeLessThan(Math.min(...words));
    for (const name of ["Download CV (PDF)", "Download letter (PDF)"]) expect(classesOf(html, name)).toContain("border-accent");
    for (const name of ["Download CV (Word)", "Download letter (Word)"]) {
      expect(classesOf(html, name)?.split(" ")).toContain("underline");
      expect(classesOf(html, name)).not.toContain("border-accent");
    }
    expect(html).not.toContain("Approve your cover letter to download it");
    expect(html).not.toContain("bg-cta");
  });
});
