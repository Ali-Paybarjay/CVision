// The last practice (#206): the report is read first, and "Practise again" sits below it.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { dataAnalystSara } from "@/features/interview/fixtures/data-analyst-sara";
import { runMockSession } from "@/features/interview/test-support";
import { LastPractice } from "./practice";

const noop = () => {};

describe("the last practice", () => {
  it("shows the date, then the whole report, then the line and the Practise again button", async () => {
    const session = await runMockSession(dataAnalystSara);
    const html = renderToStaticMarkup(
      <LastPractice report={{ session, practisedAt: "2026-10-29T10:00:00Z" }} unfinishedSince={null} onContinue={noop} onPractiseAgain={noop} />,
    );

    const line = html.indexOf("Read your feedback first. When you are ready, practise again.");
    expect(html.indexOf("Your last practice")).toBeLessThan(html.indexOf("Overall score"));
    // After the last answer card, so nothing in the report sits below the button.
    expect(html.lastIndexOf("Do this next time")).toBeLessThan(line);
    expect(html.match(/>Practise again<\/button>/g)).toHaveLength(1);
    expect(html.indexOf(">Practise again</button>")).toBeGreaterThan(line);
    expect(html).not.toContain("unfinished practice");
  });

  it("over an unfinished practice, offers to continue it above the report", async () => {
    const session = await runMockSession(dataAnalystSara);
    const html = renderToStaticMarkup(
      <LastPractice
        report={{ session, practisedAt: "2026-10-28T10:00:00Z" }}
        unfinishedSince="2026-10-30T09:00:00Z"
        onContinue={noop}
        onPractiseAgain={noop}
      />,
    );

    expect(html).toContain("You have an unfinished practice");
    expect(html).toContain('Started <time dateTime="2026-10-30T09:00:00Z">30 Oct 2026</time>. The report below is from your last finished');
    expect(html.match(/>Continue your practice<\/button>/g)).toHaveLength(1);
    expect(html.indexOf(">Continue your practice</button>")).toBeLessThan(html.indexOf("Your last practice"));
    expect(html.indexOf("Your last practice")).toBeLessThan(html.indexOf("Overall score"));
    // Practise again still starts a new practice, below the report.
    expect(html.match(/>Practise again<\/button>/g)).toHaveLength(1);
  });
});
