// The summary card (#16): first in the review step, it asks how the summary should describe the user before writing it.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SummaryCard } from "@/app/tailor/summary-card";
import type { Profile, TailoringChange } from "@/shared/contracts";
import { personas } from "@/shared/sample-data";

vi.mock("@/features/tailor/actions", () => ({ writeSummaryForJob: vi.fn() }));

const { profile, jobs } = personas.reza;
const card = (who: Profile, changes: TailoringChange[] = []) =>
  renderToStaticMarkup(<SummaryCard jobId="j" profile={who} changes={changes} onWritten={() => {}} onDecide={async () => {}} />);
const summary: TailoringChange = {
  id: "s1",
  jobId: "j",
  section: "summary",
  before: profile.summary,
  after: "Maths teacher and head of year with nine years of planning.",
  evidence: profile.summary,
  evidenceSource: "cv",
  status: "proposed",
};

describe("the summary card", () => {
  it("asks how to describe the user, with their summary chosen, then their titles and their own words", () => {
    const html = card(profile);
    expect(html).toContain("Recruiters read this first");
    expect(html).toContain("How should your summary describe you?");
    const order = ["As my summary says now", "Maths Teacher and Head of Year 9", "Maths Teacher<", "In my own words", "Write my summary"].map((text) => html.indexOf(text));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toMatch(/checked="" value="summary"/);
  });

  it("never offers the job ad's title, and says so", () => {
    const html = card(profile);
    expect(html).not.toContain(jobs[0].title);
    expect(html).toContain("We don’t give you the job ad’s title. If it is true for you, type it in your own words.");
  });

  it("starts with the latest job title for a user with no summary", () => {
    const html = card({ ...profile, summary: "" });
    expect(html).not.toContain("As my summary says now");
    expect(html).toMatch(/checked="" value="title:0"/);
  });

  it("shows a summary already written, with Approve and Try another title, and no question", () => {
    const html = card(profile, [summary]);
    expect(html).toContain(summary.after);
    expect(html).toContain("Approve");
    expect(html).toContain("Try another title");
    expect(html).not.toContain("How should your summary describe you?");
  });
});
