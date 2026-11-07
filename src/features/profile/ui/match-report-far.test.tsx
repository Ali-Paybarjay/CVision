import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { personas } from "@/shared/sample-data";
import { MatchReport } from "./match-report";

// A pilot tailored his CV for a job far from his field and found the questions no use (#338). The match report now
// says so before the Tailor button. Its own file, so it doesn't meet the changes to jobs-ui.test.tsx in #342.

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const noop = () => {};
const { jobs, match } = personas.sara;
const job = jobs[0];

function report(score: number, saved: "saved" | "signed-out" = "saved") {
  return renderToStaticMarkup(
    <MatchReport job={job} match={{ ...match, score }} saved={saved} demo={null} focusHeading={false} onCheckAnother={noop} />,
  );
}

describe("MatchReport for a job far from the profile", () => {
  it("says tailoring can't fill the gaps when the fit is low, and still offers Tailor", () => {
    const html = report(35);
    expect(html).toContain("This job is a long way from your profile");
    expect(html).toContain("Tailoring only rewords what you’ve told us");
    expect(html).toContain("Tailor my CV for this job");
  });

  it("says nothing of the kind for a partial or strong fit", () => {
    expect(report(50)).not.toContain("a long way from your profile");
    expect(report(80)).not.toContain("a long way from your profile");
  });

  it("says nothing when there is no Tailor button to warn about", () => {
    expect(report(35, "signed-out")).not.toContain("a long way from your profile");
  });
});
