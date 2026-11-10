import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { JobListItem, JobRow, type JobRowState } from "./job-list-item";

// A job in a list of the user's jobs, with Delete (#462). The page stays a server page; only the row is interactive.

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("../job-actions", () => ({ deleteJobAction: vi.fn() }));

const name = "Junior Data Analyst at Pennine Health Analytics";
const href = "/tailor?job=00000000-0000-4000-8000-000000000001";
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const noop = () => {};

function row(state: JobRowState, onDashboard = false) {
  return renderToStaticMarkup(<JobRow name={name} href={href} onDashboard={onDashboard} state={state} onAsk={noop} onCancel={noop} onConfirm={noop} />);
}

describe("JobListItem", () => {
  it("links to the job and offers to delete it, naming the job for a screen reader", () => {
    const html = renderToStaticMarkup(<JobListItem jobId="00000000-0000-4000-8000-000000000001" name={name} href={href} onDashboard={false} />);

    expect(html).toContain(`<a href="${href}" class="text-accent underline underline-offset-4">${name}</a>`);
    expect(html).toMatch(/<button[^>]*>Delete<span class="sr-only"> Junior Data Analyst at Pennine Health Analytics<\/span><\/button>/);
    expect(html).not.toContain("alertdialog");
  });

  it("keeps a job the user applied for: no Delete, and says it is on their dashboard", () => {
    const html = row({ phase: "idle" }, true);

    expect(text(html)).toContain("On your dashboard");
    expect(html).not.toContain("<button");
  });

  it("asks in the row before deleting, saying what goes with the job and that it can't be undone", () => {
    const html = row({ phase: "asking", deleting: false, problem: null });

    const dialog = /<div role="alertdialog" aria-labelledby="([^"]+)" aria-describedby="([^"]+)"/.exec(html);
    expect(dialog).not.toBeNull();
    const [, questionId, detailId] = dialog ?? [];
    expect(html).toContain(`<p id="${questionId}" class="font-semibold">Delete this job?</p>`);
    expect(html).toMatch(new RegExp(`<p id="${detailId}"[^>]*>Its match, your CV changes for it and any interview practice go too. This can’t be undone.</p>`));
    expect(text(html)).toContain(name);
    // One Delete at a time: the row's own button gives way to the question's two.
    expect(text(html)).not.toMatch(/Delete Junior/);
    expect(html).toMatch(/<button type="button"[^>]*>Delete job<\/button>/);
    expect(html).toMatch(/<button[^>]*>Keep it<\/button>/);
    expect(html).not.toContain('role="alert"');
  });

  it("says it is deleting, with both buttons off until the answer comes", () => {
    const html = row({ phase: "asking", deleting: true, problem: null });

    expect(html).toMatch(/<button type="button" disabled=""[^>]*>Deleting…<\/button>/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Keep it<\/button>/);
  });

  it("says why a job was not deleted, out loud, and keeps the question open", () => {
    const html = row({ phase: "asking", deleting: false, problem: "We couldn’t delete this job just now. Try again in a minute." });

    expect(html).toContain('<p role="alert" class="mt-2 text-sm text-error">We couldn’t delete this job just now. Try again in a minute.</p>');
    expect(html).toContain("Delete job");
  });

  it("says in place that the job was deleted, with no link to it any more", () => {
    const html = row({ phase: "deleted" });

    expect(html).toBe(`<li><p role="status" tabindex="-1" class="text-text-muted">Deleted: ${name}</p></li>`);
  });
});
