// The daily limit's message sits under the page's heading, which takes focus when the page is ready, so a screen
// reader reads it (#468). Above the heading, after focus moved there, it was never read.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TailorWorkspace } from "@/app/tailor/tailor-workspace";
import { personas } from "@/shared/sample-data";

vi.mock("@/features/tailor/actions", () => ({ decideChange: vi.fn(), answerGap: vi.fn(), suggestCvChanges: vi.fn(), createCoverLetter: vi.fn(), recordApply: vi.fn() }));

const { profile, jobs } = personas.sara;
const notice = "You have used today's AI requests. You can still answer No to a question.";
const page = (withNotice: boolean) =>
  renderToStaticMarkup(<TailorWorkspace job={jobs[0]} jobUrl={null} label="" profile={profile} prompts={[]} {...(withNotice ? { notice } : {})} />);

describe("the page's notice (#468)", () => {
  it("comes once, after the heading", () => {
    const html = page(true);
    expect(html.split(notice.replace(/'/g, "&#x27;")).length - 1).toBe(1);
    expect(html.indexOf("<h1")).toBeLessThan(html.indexOf("You have used today"));
  });

  it("is not there without one", () => {
    expect(page(false)).not.toContain("You have used today");
  });
});
