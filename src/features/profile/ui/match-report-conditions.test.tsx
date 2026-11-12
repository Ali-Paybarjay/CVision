import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Job, MatchResult } from "@/shared/contracts";
import { personas } from "@/shared/sample-data";
import { buildMatchResult } from "../match";
import { MatchReport } from "./match-report";

// The job's conditions, such as a driving licence or night shifts, in a box of their own below the gaps (#222).

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const noop = () => {};
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, " ");
const { profile, jobs, match } = personas.sara;

function report(job: Job, result: MatchResult = match) {
  return text(
    renderToStaticMarkup(
      <MatchReport job={job} match={result} saved="saved" demo={null} focusHeading={false} onCheckAnother={noop} />,
    ),
  );
}

describe("MatchReport and the job's conditions", () => {
  const job: Job = {
    ...jobs[0],
    requirements: {
      essential: [...jobs[0].requirements.essential, "Full clean driving licence", "Weekend and night shift cover when needed"],
      desirable: [...jobs[0].requirements.desirable, "CSCS card", "Able to lift up to 25kg"],
    },
    conditions: [
      { requirement: "Full clean driving licence", kind: "credential" },
      { requirement: "Weekend and night shift cover when needed", kind: "working" },
      { requirement: "CSCS card", kind: "credential" },
      { requirement: "Able to lift up to 25kg", kind: "sensitive" },
    ],
  };

  it("lists them in three groups, says they are not in the score, and marks the desirable ones", () => {
    const html = report(job);

    expect(html).toContain("Other things this job asks for");
    expect(html).toContain("We don’t count these in your score. Check each one before you apply.");
    expect(html).toMatch(
      /Licences and cards Full clean driving licence CSCS card \(desirable\) Working conditions Weekend and night shift cover when needed For you to check Able to lift up to 25kg \(desirable\)/,
    );
    // Below the gaps, never among them.
    expect(html.indexOf("Gaps to look at")).toBeLessThan(html.indexOf("Other things this job asks for"));
  });

  it("shows no box for a job with no conditions", () => {
    expect(report({ ...jobs[0], conditions: [] })).not.toContain("Other things this job asks for");
  });

  it("shows the box and why there is no score when every requirement is a condition", () => {
    const onlyConditions: Job = {
      ...jobs[0],
      requirements: { essential: ["Full clean driving licence", "Enhanced DBS check"], desirable: [] },
    };
    const result = buildMatchResult(onlyConditions, profile, { requirements: [], reasoning: "" }).match;

    const html = report(onlyConditions, result);

    expect(html).not.toContain("out of 100");
    expect(html).not.toContain("pasted the whole ad");
    expect(html).toContain("Everything this ad asks for is a licence, a check or a working condition");
    expect(html).toMatch(/Licences and cards Full clean driving licence For you to check Enhanced DBS check/);
  });
});
