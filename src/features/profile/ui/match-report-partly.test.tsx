import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Gap } from "@/shared/contracts";
import { personas } from "@/shared/sample-data";
import { defaultDetail } from "../match";
import { MatchReport } from "./match-report";

// Each gap says in words how far the profile shows it (#188, decision 3B): "Partly shown" with the profile lines
// behind it, or "Not shown yet" with no quote. Its own file, so it doesn't meet the changes in #222.

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const noop = () => {};
const { jobs, match } = personas.sara;
const [unclear, ...rest] = match.gaps;

function report(first: Gap, others: Gap[] = rest) {
  return renderToStaticMarkup(
    <MatchReport
      job={jobs[0]}
      match={{ ...match, gaps: [first, ...others] }}
      saved="saved"
      demo={null}
      focusHeading={false}
      onCheckAnother={noop}
    />,
  );
}

/** The markup of one gap's list item, found by its requirement. */
function gapItem(html: string, requirement: string): string {
  const start = html.indexOf(`<p class="font-semibold">${requirement}</p>`);
  expect(start, requirement).toBeGreaterThan(-1);
  // Up to the next gap: a gap's own lines sit in a nested list, so its first </li> may not be its end.
  const next = html.indexOf('<p class="font-semibold">', start + 1);
  return html.slice(start, next === -1 ? undefined : next);
}

describe("MatchReport: how far the profile shows each gap (#188)", () => {
  it("labels an unclear gap Partly shown and quotes its one profile line", () => {
    const html = report({ ...unclear, evidence: ["Built Tableau dashboards for the regional sales team"] });
    const item = gapItem(html, unclear.requirement);
    expect(item).toContain("Partly shown");
    expect(item).toContain("From your profile: <q");
    expect(item).toContain("Built Tableau dashboards for the regional sales team</q>");
  });

  it("lists two or three lines under one From your profile", () => {
    const html = report({ ...unclear, evidence: ["Built Tableau dashboards for the regional sales team", "SQL"] });
    const item = gapItem(html, unclear.requirement);
    expect(item.match(/From your profile/g)).toHaveLength(1);
    expect(item).toContain("<li><q");
    expect(item).toContain("SQL</q>");
  });

  it("labels a missing gap Not shown yet, with no quote", () => {
    const missing = rest.find((gap) => gap.kind === "missing")!;
    const item = gapItem(report(unclear), missing.requirement);
    expect(item).toContain("Not shown yet");
    expect(item).not.toContain("Partly shown");
    expect(item).not.toContain("From your profile");
  });

  it("never quotes the profile under a missing gap, even if one came with lines", () => {
    const missing: Gap = { ...rest.find((gap) => gap.kind === "missing")!, evidence: ["SQL"] };
    const item = gapItem(report(unclear, [missing]), missing.requirement);
    expect(item).not.toContain("From your profile");
  });

  it("labels an unclear gap with no lines, without an empty quote", () => {
    const item = gapItem(report(unclear), unclear.requirement);
    expect(item).toContain("Partly shown");
    expect(item).not.toContain("From your profile");
  });

  it("says in the score note that a Partly shown requirement counts half", () => {
    expect(report(unclear)).toContain("and one marked “Partly shown” counts half.");
  });
});

// The match marks a requirement "unclear" when the model skipped it, or called it met with no profile line behind it.
// Nobody saw the profile show any of it, so it isn't "Partly shown" (#527).
describe("MatchReport: a gap the match couldn't check (#527)", () => {
  it.each([
    ["the model skipped it", defaultDetail.unchecked],
    ["the model gave no profile line for it", defaultDetail.noEvidence],
  ])("labels it Not checked, not Partly shown, when %s", (_why, detail) => {
    const item = gapItem(report({ ...unclear, detail }), unclear.requirement);
    expect(item).toContain("Not checked");
    expect(item).not.toContain("Partly shown");
    expect(item).toContain(detail);
  });

  it("keeps Partly shown for an unclear gap the profile touches on", () => {
    const html = report({ ...unclear, detail: defaultDetail.unclear });
    const item = gapItem(html, unclear.requirement);
    expect(item).toContain("Partly shown");
    expect(html).not.toContain("Not checked");
  });

  it("keeps Not shown yet for a missing gap, whatever its sentence says", () => {
    const missing: Gap = { ...rest.find((gap) => gap.kind === "missing")!, detail: defaultDetail.unchecked };
    const item = gapItem(report(unclear, [missing]), missing.requirement);
    expect(item).toContain("Not shown yet");
    expect(item).not.toContain("Not checked");
  });

  it("says in the score note that a Not checked requirement counts half too", () => {
    expect(report({ ...unclear, detail: defaultDetail.unchecked })).toContain(
      "and one marked “Partly shown” or “Not checked” counts half.",
    );
  });
});
