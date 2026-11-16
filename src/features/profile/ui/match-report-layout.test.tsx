import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Gap } from "@/shared/contracts";
import { personas } from "@/shared/sample-data";
import { defaultDetail } from "../match";
import { MatchReport } from "./match-report";

// The match report on a phone (#503): the way on to Tailor stays on screen in a bar of its own, a job far from the
// profile is flagged under the score, only essential gaps are amber, and no gap repeats its label in a sentence.

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const noop = () => {};
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const { jobs, match } = personas.sara;
const job = jobs[0];
const essential = match.gaps.find((gap) => gap.importance === "essential")!;
const desirable = match.gaps.find((gap) => gap.importance === "desirable" && gap.kind === "missing")!;

function report(overrides: Partial<React.ComponentProps<typeof MatchReport>> = {}) {
  return renderToStaticMarkup(
    <MatchReport job={job} match={match} saved="saved" demo={null} focusHeading={false} onCheckAnother={noop} {...overrides} />,
  );
}

/** One gap's whole list item, its icon included, found by its requirement. These gaps quote no lines, so it ends at the first </li>. */
function gapItem(html: string, requirement: string): string {
  const at = html.indexOf(`<p class="font-semibold">${requirement}</p>`);
  expect(at, requirement).toBeGreaterThan(-1);
  return html.slice(html.lastIndexOf("<li ", at), html.indexOf("</li>", at));
}

describe("MatchReport on a phone (#503)", () => {
  it("keeps Tailor my CV for this job alone in a bar at the bottom of the screen, before the other links", () => {
    const html = report();
    const start = html.lastIndexOf("<div", html.indexOf("sticky bottom-0"));
    const bar = html.slice(start, html.indexOf("</div>", start));

    expect(text(bar).trim()).toBe("Tailor my CV for this job");
    expect(bar).toContain(`href="/tailor?job=${job.id}"`);
    expect(html.indexOf("Check another job")).toBeGreaterThan(start);
    expect(html.indexOf("Open the original ad")).toBeGreaterThan(start);
  });

  it("has no bar when there is no job to tailor", () => {
    const html = report({ saved: "failed" });

    expect(html).not.toContain("sticky bottom-0");
    expect(text(html)).toContain("Check another job");
  });

  it("says a job is a long way from the profile under the score, before where the profile matches", () => {
    const html = text(report({ match: { ...match, score: 35 } }));
    const warning = html.indexOf("This job is a long way from your profile");

    expect(warning).toBeGreaterThan(html.indexOf("out of 100"));
    expect(warning).toBeLessThan(html.indexOf("Where you already match"));
  });

  it("leaves out the stock sentence under a missing gap, and keeps one the model wrote", () => {
    const stock: Gap = { ...desirable, id: "gap-python", requirement: "Python", detail: defaultDetail.missing };
    const html = report({ match: { ...match, gaps: [essential, desirable, stock] } });

    expect(html).not.toContain(defaultDetail.missing);
    expect(gapItem(html, "Python")).toContain("Not shown yet");
    expect(gapItem(html, desirable.requirement)).toContain(desirable.detail);
  });

  it("shows only an essential gap in amber, and every gap still says in words how far the profile shows it", () => {
    const html = report();
    const amber = gapItem(html, essential.requirement);
    const quiet = gapItem(html, desirable.requirement);

    expect(amber).toContain("text-warning");
    expect(amber).toContain("bg-warning-bg");
    expect(amber).toContain("Partly shown");
    expect(quiet).not.toContain("text-warning");
    expect(quiet).not.toContain("bg-warning-bg");
    expect(quiet).toContain("Not shown yet");
  });
});
