import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CvCheckResult } from "@/shared/contracts";
import { carriedCvFor, carryFromCheck } from "@/shared/carried-cv";
import { CvCheckReport, newCheck } from "./cv-check-form";

// Render checks for the result of a CV check: where its main button leads and what the next step says.

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
    <CvCheckReport
      result={result}
      truncated={false}
      signedIn={signedIn}
      file={file}
      account={signedIn ? "account-a" : null}
      demoMode={false}
      onCheckAnother={() => {}}
    />,
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
  it("says Tailor asks about what's missing, suggests changes for a job and lets the user approve each one", () => {
    const html = render(true);
    expect(html).toContain("Next: tailor your CV to a job");
    expect(html).toContain("Tailor asks about the skills and experience the job wants that your CV doesn’t show yet");
    expect(html).toContain("lets you approve every one");
    expect(html).not.toContain("make these fixes");
    expect(html).not.toContain("rewrites your CV");
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

  // Said plainly, so the second upload after sign-up isn't a surprise (#375).
  it("tells a visitor who uploaded a file that they'll upload it once more after creating their account", () => {
    expect(render(false, file)).toContain("You’ll upload your CV once more after you create your account");
    expect(render(true, file)).not.toContain("You’ll upload your CV once more");
    expect(render(false, null)).not.toContain("You’ll upload your CV once more");
  });
});

// A pilot lost the result on leaving the page (#375).
describe("CvCheckReport download", () => {
  it("offers the result as a file, beside Check another CV and below the one Coral button", () => {
    const html = render(false);

    expect(html).toContain(">Download this result</button>");
    expect(html.indexOf("Download this result")).toBeGreaterThan(html.indexOf("Next: tailor your CV to a job"));
    expect(html.match(/bg-cta/g)).toHaveLength(1);
  });
});

// Found by Shayan (#385): after a second check, the menu's Profile still offered the first check's file as "the CV
// you just checked", until Tailor was pressed again.
describe("a new check", () => {
  const first = new File(["first"], "first.docx");
  const second = new File(["second"], "second.docx");

  it("forgets the file an earlier Tailor click kept, when the new check was pasted text", () => {
    carryFromCheck({ signedIn: true, file: first, account: "account-a" });
    expect(carriedCvFor("account-a")).toBe(first);

    newCheck({ result, truncated: false, signedIn: true, file: null, account: "account-a" });
    expect(carriedCvFor("account-a")).toBeNull();
  });

  it("forgets it too when the new check was another file, which goes to Profile only with its own Tailor click", () => {
    carryFromCheck({ signedIn: true, file: first, account: "account-a" });
    const checked = newCheck({ result, truncated: false, signedIn: true, file: second, account: "account-a" });
    expect(carriedCvFor("account-a")).toBeNull();

    carryFromCheck(checked);
    expect(carriedCvFor("account-a")).toBe(second);
  });
});
