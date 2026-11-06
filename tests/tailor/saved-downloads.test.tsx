import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SavedDownloads } from "@/app/tailor/saved/saved-downloads";

vi.mock("@/features/tailor/actions", () => ({ exportSavedDocument: vi.fn() }));

describe("the downloads of the saved copy (#207)", () => {
  it("offers the CV and the letter as PDF and Word when a letter was sent", () => {
    const html = renderToStaticMarkup(<SavedDownloads jobId="j" hasLetter />);
    for (const name of ["Download CV (PDF)", "Download CV (Word)", "Download letter (PDF)", "Download letter (Word)"]) expect(html).toContain(name);
  });

  it("offers only the CV when no letter was sent, and no Coral button", () => {
    const html = renderToStaticMarkup(<SavedDownloads jobId="j" hasLetter={false} />);
    expect(html).toContain("Download CV (PDF)");
    expect(html).not.toContain("Download letter");
    expect(html).not.toContain("bg-cta");
  });
});
