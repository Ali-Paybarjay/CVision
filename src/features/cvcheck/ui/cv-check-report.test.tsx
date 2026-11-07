import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CvCheckResult } from "@/shared/contracts";
import { CvCheckReport } from "./cv-check-form";

// Render checks for the result of a CV check: where its main button leads, what the next step says, and the
// copy buttons for suggested wording. Clicking is tried in a browser.

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const result: CvCheckResult = {
  readiness: "nearly-ready",
  score: 72,
  summary: "Nearly ready. Add a short skills list first.",
  issues: [
    {
      id: "issue-1",
      title: "Duties, not results",
      explanation: "Your lines list duties, so a UK employer can't see what changed because of you.",
      fix: `Change "Responsible for the rota" to 'Planned the weekly staff rota' if that is what you did.`,
      severity: "medium",
    },
    {
      id: "issue-2",
      title: "No skills section",
      explanation: "A recruiter has to dig through the job entry to see what you can do.",
      fix: "Add a short 'Skills' section with four to six items you have used.",
      severity: "low",
    },
  ],
};

function render(signedIn: boolean, file: File | null = null) {
  return renderToStaticMarkup(
    <CvCheckReport result={result} truncated={false} signedIn={signedIn} file={file} demoMode={false} onCheckAnother={() => {}} />,
  );
}

describe("CvCheckReport", () => {
  // A signed-in pilot was sent to sign-up from here (#331).
  it("sends a signed-in user to their profile, and a visitor to sign-up and then their profile", () => {
    expect(render(true)).toContain('href="/profile"');
    expect(render(false)).toContain('href="/sign-up?next=%2Fprofile"');
  });

  // A pilot wanted CVision to ask about what's missing and rewrite the CV, not knowing Tailor does (#333). The card
  // doesn't promise to make these fixes: Tailor works from the job, not from this check.
  it("says Tailor asks about what's missing, rewrites the CV for a job and lets the user approve each change", () => {
    const html = render(true);
    expect(html).toContain("Next: let CVision rewrite your CV for a job");
    expect(html).toContain("Tailor asks you about anything the job needs that your CV doesn’t show yet");
    expect(html).toContain("lets you approve every change");
    expect(html).not.toContain("make these fixes");
  });

  // A pilot asked which exact words to write (#335).
  it("offers to copy suggested wording of two words or more, and nothing for a single word", () => {
    const html = render(true);
    expect(html).toContain("Planned the weekly staff rota");
    expect(html).toContain('aria-label="Copy: Planned the weekly staff rota"');
    expect(html).not.toContain("Copy: Skills");
    expect(html.match(/aria-label="Copy: /g)).toHaveLength(1);
  });
});

// A pilot had to upload the same CV again in Profile (#336).
describe("CvCheckReport with an uploaded CV", () => {
  const file = new File(["cv"], "sara.docx");

  it("tells a signed-in user the checked CV comes with them to Profile", () => {
    expect(render(true, file)).toContain("We’ll bring the CV you just checked");
  });

  it("promises nothing for a visitor, whose file would be lost on the way through sign-up, or for pasted text", () => {
    expect(render(false, file)).not.toContain("We’ll bring the CV you just checked");
    expect(render(true, null)).not.toContain("We’ll bring the CV you just checked");
  });
});
