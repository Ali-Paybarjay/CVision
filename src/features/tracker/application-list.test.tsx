import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ApplicationStatusSchema, type Application } from "@/shared/contracts";
import { personas } from "@/shared/sample-data";
import { ApplicationList } from "./application-list";
import type { TrackedApplication } from "./model";
import { sampleApplications, sampleApplicationsOn } from "./sample";

// What the dashboard rows say about days and closing dates, what the closing suggestion offers, and the Save button
// mid-save. Saving and closing are tested in actions.test.ts and model.test.ts, and where the focus goes after a save
// in tests/e2e/dashboard.spec.ts.

const { updateApplication, closeWithoutNews } = vi.hoisted(() => ({ updateApplication: vi.fn(), closeWithoutNews: vi.fn() }));
vi.mock("./actions", () => ({ updateApplication, closeWithoutNews }));
// While a test sets it, every form is drawn mid-save: pending, with no result yet.
const midSave = vi.hoisted(() => ({ on: false }));
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return {
    ...react,
    useActionState: (action: never, initialState: unknown) => {
      const [state, dispatch, pending] = react.useActionState(action, initialState);
      return midSave.on ? [null, dispatch, true] : [state, dispatch, pending];
    },
  };
});
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
const renderMidSave = (items: TrackedApplication[]) => {
  midSave.on = true;
  try {
    return render(items);
  } finally {
    midSave.on = false;
  }
};

const row = (id: string, status: Application["status"], date: string, title: string, deadline?: string | null): TrackedApplication => ({
  application: { id, jobId: `job-${id}`, date, status, nextStep: null },
  job: { title, company: "Etherow Freight", deadline },
});
const withStep = (item: TrackedApplication, nextStep: string, nextStepDate?: string): TrackedApplication => ({
  ...item,
  application: { ...item.application, nextStep, nextStepDate },
});

describe("the dashboard's application list", () => {
  it("counts days without news for applied and interview only", () => {
    const html = text(render(sampleApplications));

    expect(html).toContain("Interview stage since 20 Oct 2026 No news for 5 days");
    expect(html).toContain("Applied on 16 Oct 2026 No news for 9 days");
    // Straight on to the closing date or the next step: no count for ready or closed rows.
    expect(html).toContain("Ready to apply since 23 Oct 2026 Closes in 5 days.");
    expect(html).toContain("Closed on 9 Oct 2026 Next step:");
  });

  it("lists closed applications apart, under a Closed heading below the open ones", () => {
    const html = render([
      row("1", "rejected", "2026-10-01", "Closed first"),
      row("2", "applied", "2026-10-20", "Open"),
      row("3", "withdrawn", "2026-10-02", "Closed second"),
      row("4", "ready", "2026-10-21", "Also open"),
    ]);

    const titles = (part: string, tag: string) => [...part.matchAll(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, "g"))].map((match) => match[1]);
    const closedList = html.match(/<h3 id="closed-title"[^>]*>([^<]+)<\/h3><ul aria-labelledby="closed-title"[^>]*>(.*?)<\/ul>/);
    expect(closedList?.[1]).toBe("Closed (2)");
    // Closed rows are h4 under that heading; the open list above has only the open rows.
    expect(titles(closedList?.[2] ?? "", "h4")).toEqual(["Closed first", "Closed second"]);
    expect(titles(html.slice(0, closedList?.index), "h3")).toEqual(["Open", "Also open"]);
    expect(titles(html, "h3")).toEqual(["Open", "Also open", "Closed (2)"]);
  });

  it("has no Closed heading while nothing is closed, and no open list once everything is", () => {
    const open = render([row("1", "applied", "2026-10-20", "Open")]);
    expect(open).not.toContain("closed-title");
    expect(open.match(/<ul /g)).toHaveLength(1);

    const closed = render([row("1", "rejected", "2026-10-20", "Closed")]);
    expect(closed.match(/<ul /g)).toHaveLength(1);
    expect(closed).toContain('<ul aria-labelledby="closed-title"');
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

  it("keeps the form open and the Save button able to hold the focus while saving", () => {
    // The saved row can come back before the save is done, with nothing left to save. Disabled then, the button would
    // drop the focus to the top of the page before its message could take it (#154).
    const saving = renderMidSave([withStep(row("1", "applied", "2026-10-20", "Data Analyst"), "Call back")]);
    expect(saving).toMatch(/<button type="submit"[^>]* aria-disabled="true"[^>]*>Saving…<\/button>/);
    expect(saving).not.toContain('disabled=""');
    expect(saving).toContain(">Cancel</button>");
  });

  it("shows only the date once the application has been sent, and nothing without a closing date", () => {
    expect(text(render([row("1", "applied", "2026-10-20", "Data Analyst", "2026-10-24")]))).toContain("Closing date 24 Oct 2026 ");
    expect(render([row("1", "applied", "2026-10-20", "Data Analyst", "2026-10-24")])).not.toContain("border-warning");
    expect(text(render([row("1", "ready", "2026-10-20", "Data Analyst", null)]))).not.toContain("Closing date");
  });
});

describe("a row's next step (#210, #211)", () => {
  const dated = (date: string, status: Application["status"] = "applied") =>
    render([withStep(row("1", status, "2026-10-20", "Data Analyst"), "Call back", date)], "2026-10-29");

  it("reads as text with an Edit button named for the job and company, and no form until Edit", () => {
    const html = render([withStep(row("1", "applied", "2026-10-20", "Data Analyst"), "Call back on Friday")]);

    expect(text(html)).toContain("Next step: Call back on Friday Edit Data Analyst at Etherow Freight");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("Save");
  });

  it("names the Edit button by the row's date when the job cannot be read", () => {
    const html = text(render([{ ...withStep(row("1", "applied", "2026-10-20", "Data Analyst"), "Call back"), job: null }]));

    expect(html).toContain("Edit the application from 20 Oct 2026");
  });

  it("says when there is no next step yet, with a button to add one", () => {
    expect(text(render([row("1", "applied", "2026-10-20", "Data Analyst")]))).toContain(
      "No next step yet Add a next step for Data Analyst at Etherow Freight",
    );
  });

  it("says when it is due in words with an icon, never colour alone", () => {
    expect(text(dated("2026-10-29"))).toContain("Next step: Call back Due today Edit");
    expect(text(dated("2026-10-30"))).toContain("Next step: Call back Due tomorrow Edit");
    expect(dated("2026-10-30")).toMatch(/font-semibold"><svg[^>]*aria-hidden="true"/);
    expect(text(dated("2026-11-06"))).toContain("Next step: Call back By Fri 6 Nov Edit");
    expect(dated("2026-11-06")).toMatch(/text-text-muted"><svg[^>]*aria-hidden="true"/);
  });

  it("warns like a passed closing date when it is overdue", () => {
    const html = dated("2026-10-26");

    expect(text(html)).toContain("Overdue. It was due Mon 26 Oct.");
    expect(html).toMatch(/border-warning[^>]*><svg[^>]*aria-hidden="true"/);
  });

  it("only shows the date, muted, on a closed application", () => {
    const html = dated("2026-10-26", "rejected");

    expect(text(html)).toContain("Next step: Call back By Mon 26 Oct Edit");
    expect(html).not.toContain("Overdue");
    expect(html).not.toContain("border-warning");
  });

  it("shows Sara's sample with one next step due tomorrow and one overdue, on any day", () => {
    // The texts name no weekday, as the dates move with today and would soon say another day.
    for (const [today, overdue] of [
      ["2026-10-25", "Fri 23 Oct"],
      ["2026-10-30", "Wed 28 Oct"],
    ]) {
      const html = text(render(sampleApplicationsOn(today), today));

      expect(html).toContain("Next step: Practise the interview questions Due tomorrow");
      expect(html).toContain(`Next step: Email the recruiter if there is no reply yet Overdue. It was due ${overdue}.`);
    }
  });

  it("keeps a saved date outside the When menu, chosen, so saving a new status alone does not drop it", () => {
    // Drawn mid-save, the form is open with the saved values.
    const html = renderMidSave([withStep(row("1", "applied", "2026-10-20", "Data Analyst"), "Call back", "2026-10-20")]);

    expect(html).toMatch(/<option value="2026-10-20" selected="">Keep · Tue 20 Oct<\/option><option value="">No date<\/option>/);
    expect(html).toContain('<option value="2026-10-25">Today · Sun 25 Oct</option>');
  });
});

describe("the link to a job's ad", () => {
  it("sits under the title and company, and opens the job's own ad page", () => {
    const html = render([{ ...row("1", "applied", "2026-10-20", "Data Analyst"), hasAd: true }]);

    expect(text(html)).toContain("Data Analyst Etherow Freight Job ad for Data Analyst at Etherow Freight Applied on");
    expect(html).toMatch(/<a href="\/dashboard\/jobs\/job-1"[^>]*>Job ad<span class="sr-only">/);
  });

  it("is not shown when the job has no ad to open, or cannot be read", () => {
    expect(render([row("1", "applied", "2026-10-20", "Data Analyst")])).not.toContain("Job ad");
    expect(render([{ ...row("1", "applied", "2026-10-20", "Data Analyst"), job: null, hasAd: true }])).not.toContain("Job ad");
  });

  it("does not bring the ad's text to the dashboard", () => {
    const html = render(sampleApplications);

    for (const job of personas.sara.jobs) expect(html).not.toContain(job.description.slice(0, 40));
    expect(html.match(/>Job ad</g)).toHaveLength(2);
  });
});

// The report link needs a finished practice, which only an account has (listPracticeSummaries), so it is tested
// here rather than in tests/e2e, where Sara's sample rows have no report.
describe("the link to a job's interview report", () => {
  const reported = (status: Application["status"], overall: number): TrackedApplication => ({
    ...row("1", status, "2026-10-20", "Data Analyst"),
    hasAd: true,
    report: { overall },
  });

  it("sits next to the Job ad link, with the latest score, and opens the report on the interview page", () => {
    const html = render([reported("applied", 3.4)]);

    expect(text(html)).toContain("Etherow Freight Job ad for Data Analyst at Etherow Freight Interview report for");
    expect(html).toMatch(/<a href="\/interview\?job=job-1"[^>]*>Interview report<span class="sr-only">/);
  });

  it("shows a short score on screen, and the job and score in words to a screen reader", () => {
    const html = render([reported("applied", 4)]);

    expect(html).toContain('<span class="sr-only"> for Data Analyst at Etherow Freight, 4.0 out of 5</span>');
    expect(html).toContain('<span aria-hidden="true">\u00a0(4.0 / 5)</span>');
  });

  it("is shown in every status, open or closed", () => {
    for (const status of ApplicationStatusSchema.options) expect(render([reported(status, 3.4)])).toContain(">Interview report<");
  });

  it("replaces the Practise button at interview stage, which stays when there is no report", () => {
    expect(render([reported("interview", 3.4)])).not.toContain("Practise for this interview");
    expect(render([row("1", "interview", "2026-10-20", "Data Analyst")])).toMatch(
      /<a href="\/interview\?job=job-1"[^>]*>Practise for this interview<\/a>/,
    );
  });

  it("is not shown without a finished practice, or when the job cannot be read", () => {
    expect(render([row("1", "applied", "2026-10-20", "Data Analyst")])).not.toContain("Interview report");
    const unreadable = { ...reported("interview", 3.4), job: null };
    expect(render([unreadable])).not.toContain("Interview report");
    // With no title to name the link, the Practise button stays.
    expect(render([unreadable])).toContain("Practise for this interview");
  });

  it("is not shown for Sara's sample rows, which have no saved practice", () => {
    expect(render(sampleApplications)).not.toContain("Interview report");
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
    expect(html).not.toContain('aria-disabled="');
  });

  it("says that closing dates each one today and does not keep its earlier date", () => {
    const html = text(render([row("1", "applied", "2026-08-26", "Sixty days")]));

    expect(html).toContain(
      "Nothing changes until you press the button. Each one you close is dated today, and its earlier date is not kept, even if you change the status back later.",
    );
    expect(html).not.toContain("at any time");
  });

  it("keeps the message after closing on the page and able to take the focus", () => {
    const html = render([row("1", "applied", "2026-08-26", "Sixty days")]);

    // The button can go with the suggestion once every row is closed, so the focus moves to this message instead.
    expect(html).toMatch(/<p role="status" tabindex="-1" class="sr-only"><\/p><ul /);
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
