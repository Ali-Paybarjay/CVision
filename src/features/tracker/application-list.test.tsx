import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Application } from "@/shared/contracts";
import { ApplicationList } from "./application-list";
import type { TrackedApplication } from "./model";
import { sampleApplications } from "./sample";

// What the dashboard rows say about days and closing dates, and what the closing suggestion offers. Saving and
// closing are tested in actions.test.ts and model.test.ts.

const { updateApplication, closeWithoutNews } = vi.hoisted(() => ({ updateApplication: vi.fn(), closeWithoutNews: vi.fn() }));
vi.mock("./actions", () => ({ updateApplication, closeWithoutNews }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// The words on screen: tags become spaces, and a full stop straight after a tag closes up again.
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .replace(/ \./g, ".");
const render = (items: TrackedApplication[], today = "2026-10-25") => renderToStaticMarkup(<ApplicationList items={items} today={today} sample />);

const row = (id: string, status: Application["status"], date: string, title: string, deadline?: string | null): TrackedApplication => ({
  application: { id, jobId: `job-${id}`, date, status, nextStep: null },
  job: { title, company: "Etherow Freight", deadline },
});

describe("the dashboard's application list", () => {
  it("counts days without news for applied and interview only", () => {
    const html = text(render(sampleApplications));

    expect(html).toContain("Interview stage since 20 Oct 2026 No news for 5 days");
    expect(html).toContain("Applied on 16 Oct 2026 No news for 9 days");
    // Straight on to the closing date or the form: no count for ready or closed rows.
    expect(html).toContain("Ready to apply since 23 Oct 2026 Closes in 5 days.");
    expect(html).toContain("Closed on 9 Oct 2026 Status");
  });

  it("puts closed applications at the bottom", () => {
    const html = render([
      row("1", "rejected", "2026-10-01", "Closed first"),
      row("2", "applied", "2026-10-20", "Open"),
      row("3", "withdrawn", "2026-10-02", "Closed second"),
      row("4", "ready", "2026-10-21", "Also open"),
    ]);

    const titles = [...html.matchAll(/<h3[^>]*>([^<]+)<\/h3>/g)].map((match) => match[1]);
    expect(titles).toEqual(["Open", "Also open", "Closed first", "Closed second"]);
  });

  it("warns a ready application in words and with an icon when its closing date is a week away or less", () => {
    const html = render([row("1", "ready", "2026-10-20", "Reporting Analyst", "2026-11-01")]);

    expect(text(html)).toContain(
      "Closes in 7 days. Closing date 1 Nov 2026. The employer may close the advert early if they get enough applications, so apply soon.",
    );
    expect(html).toMatch(/border-warning[^>]*><svg[^>]*aria-hidden="true"/);
  });

  it("says plainly when the closing date has passed, or is today", () => {
    expect(text(render([row("1", "ready", "2026-10-20", "Reporting Analyst", "2026-10-24")]))).toContain(
      "The closing date has passed. It was 24 Oct 2026. Check the employer's page before you apply",
    );
    expect(text(render([row("1", "ready", "2026-10-20", "Reporting Analyst", "2026-10-25")]))).toContain("Closes today.");
  });

  it("gives a ready application further off its closing date and the early-closing line without a warning", () => {
    const html = render([row("1", "ready", "2026-10-20", "Reporting Analyst", "2026-11-02")]);

    expect(text(html)).toContain("Closing date 2 Nov 2026. The employer may close the advert early if they get enough applications.");
    expect(html).not.toContain("border-warning");
  });

  it("shows only the date once the application has been sent, and nothing without a closing date", () => {
    expect(text(render([row("1", "applied", "2026-10-20", "Data Analyst", "2026-10-24")]))).toContain("Closing date 24 Oct 2026 ");
    expect(render([row("1", "applied", "2026-10-20", "Data Analyst", "2026-10-24")])).not.toContain("border-warning");
    expect(text(render([row("1", "ready", "2026-10-20", "Data Analyst", null)]))).not.toContain("Closing date");
  });
});

describe("the suggestion to close applications with no news", () => {
  it("lists applied and interview rows with no news for 60 days or more, none of them ticked", () => {
    const html = render([
      row("1", "applied", "2026-08-26", "Sixty days"),
      row("2", "interview", "2026-07-01", "Old interview"),
      row("3", "applied", "2026-08-27", "Fifty-nine days"),
      row("4", "ready", "2025-01-01", "Old ready"),
      row("5", "rejected", "2025-01-01", "Old closed"),
    ]);

    const boxes = [...html.matchAll(/<input type="checkbox"[^>]*>/g)].map((match) => match[0]);
    expect(boxes.map((box) => box.match(/value="([^"]+)"/)?.[1])).toEqual(["1", "2"]);
    expect(boxes.some((box) => /\schecked/.test(box))).toBe(false);
    expect(text(html)).toContain("No news for 60 days or more");
    expect(text(html)).toContain("Sixty days Etherow Freight · No news for 60 days");
    // Nothing is ticked, so the one button cannot close anything yet.
    expect(html).toMatch(/<button type="submit"[^>]* disabled=""[^>]*>Close as No response<\/button>/);
  });

  it("is not shown when no row has gone 60 days without news", () => {
    const html = render([row("1", "applied", "2026-08-27", "Fifty-nine days"), row("2", "ready", "2025-01-01", "Old ready")]);

    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain("Close as No response");
  });

  it("writes nothing on its own", () => {
    render(sampleApplications);

    expect(closeWithoutNews).not.toHaveBeenCalled();
    expect(updateApplication).not.toHaveBeenCalled();
  });
});
