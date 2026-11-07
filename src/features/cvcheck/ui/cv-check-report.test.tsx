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

function render(signedIn: boolean) {
  return renderToStaticMarkup(
    <CvCheckReport result={result} truncated={false} signedIn={signedIn} demoMode={false} onCheckAnother={() => {}} />,
  );
}

describe("CvCheckReport", () => {
  // A signed-in pilot was sent to sign-up from here (#331).
  it("sends a signed-in user to their profile, and a visitor to sign-up and then their profile", () => {
    expect(render(true)).toContain('href="/profile"');
    expect(render(false)).toContain('href="/sign-up?next=%2Fprofile"');
  });

  // A pilot wanted CVision to make the fixes, not knowing Tailor does (#333).
  it("says Tailor makes these fixes, asks about what's missing and lets the user approve each change", () => {
    const html = render(true);
    expect(html).toContain("Next: let CVision make these fixes");
    expect(html).toContain("Tailor asks you about anything that’s missing, rewrites your CV for the job you want");
    expect(html).toContain("lets you approve every");
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
