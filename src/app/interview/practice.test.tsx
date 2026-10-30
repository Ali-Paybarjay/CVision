// The last practice (#206): the report is read first, and "Practise again" sits below it.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { dataAnalystSara } from "@/features/interview/fixtures/data-analyst-sara";
import { runMockSession } from "@/features/interview/test-support";
import { LastPractice } from "./practice";

describe("the last practice", () => {
  it("shows the date, then the whole report, then the line and the Practise again button", async () => {
    const session = await runMockSession(dataAnalystSara);
    const html = renderToStaticMarkup(<LastPractice report={{ session, practisedAt: "2026-10-29T10:00:00Z" }} onPractiseAgain={() => {}} />);

    const line = html.indexOf("Read your feedback first. When you are ready, practise again.");
    expect(html.indexOf("Your last practice")).toBeLessThan(html.indexOf("Overall score"));
    // After the last answer card, so nothing in the report sits below the button.
    expect(html.lastIndexOf("Do this next time")).toBeLessThan(line);
    expect(html.match(/>Practise again<\/button>/g)).toHaveLength(1);
    expect(html.indexOf(">Practise again</button>")).toBeGreaterThan(line);
  });
});
