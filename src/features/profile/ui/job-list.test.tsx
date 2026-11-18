import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { JobList, JobListView, jobAfter, type JobListJob } from "./job-list";

// The user's jobs, each with Delete (#462). A deleted job leaves the list with nothing in its place (#519).

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../job-actions", () => ({ deleteJobAction: vi.fn() }));

const job = (n: number, company: string, onDashboard = false): JobListJob => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  name: `Junior Data Analyst at ${company}`,
  href: `/tailor?job=00000000-0000-4000-8000-00000000000${n}`,
  onDashboard,
});
const jobs = [job(1, "Pennine Health Analytics"), job(2, "Irwell Energy"), job(3, "Calder Water", true)];
const empty = <p>Add a job first</p>;
const title = "Which job is this CV for?";
const noop = () => {};
const rows = (html: string) => html.match(/<li[ >]/g)?.length ?? 0;
const status = (html: string) => /<p role="status" class="sr-only">(.*?)<\/p>/.exec(html)?.[1];

describe("JobList", () => {
  it("lists every job in a card under its title, with a screen reader's status line ready and empty", () => {
    const html = renderToStaticMarkup(<JobList title={title} jobs={jobs} empty={empty} />);

    expect(html).toContain(`<h2 class="text-xl">${title}</h2>`);
    expect(rows(html)).toBe(3);
    for (const { name, href } of jobs) expect(html).toContain(`<a href="${href}" class="text-accent underline underline-offset-4">${name}</a>`);
    expect(status(html)).toBe("");
    expect(html).not.toContain("Add a job first");
  });

  it("puts the jobs still in progress first, then the ones on the user's dashboard together, each group in the order given (Marzieh, #519)", () => {
    const tees = job(4, "Tees Valley Rail", true);
    // Each group is given in the reverse of its id order, so a sort by id or by name, the list as given, or the old
    // dashboard-first order all fail: only in-progress first, with each group's given order kept, passes.
    const html = renderToStaticMarkup(<JobList title={title} jobs={[tees, jobs[1], jobs[2], jobs[0]]} empty={empty} />);

    const order = [...html.matchAll(/<a href="[^"]*" class="[^"]*">([^<]*)<\/a>/g)].map(([, name]) => name);
    expect(order).toEqual([jobs[1].name, jobs[0].name, tees.name, jobs[2].name]);
  });

  it("shows what the page shows with no jobs when there are none", () => {
    const html = renderToStaticMarkup(<JobList title={title} jobs={[]} empty={empty} />);

    expect(html).toBe(`<div><p>Add a job first</p></div><p role="status" class="sr-only"></p>`);
  });

  it("takes a deleted job away with nothing in its place, and says which job went only to a screen reader", () => {
    const html = renderToStaticMarkup(
      <JobListView title={title} jobs={[jobs[0], jobs[2]]} empty={empty} said={{ text: `Deleted: ${jobs[1].name}`, count: 1 }} onDeleted={noop} />,
    );

    expect(rows(html)).toBe(2);
    expect(html).not.toContain("Irwell Energy</a>");
    expect(html.replace(/<p role="status".*?<\/p>/, "")).not.toMatch(/Deleted|Irwell Energy/);
    expect(status(html)).toBe(`<span>Deleted: ${jobs[1].name}</span>`);
  });

  it("shows the no-jobs box in the card's place once the last job is deleted, still saying so", () => {
    const html = renderToStaticMarkup(
      <JobListView title={title} jobs={[]} empty={empty} said={{ text: `Deleted: ${jobs[0].name}`, count: 3 }} onDeleted={noop} />,
    );

    expect(html).not.toContain(title);
    expect(rows(html)).toBe(0);
    expect(html).toBe(`<div><p>Add a job first</p></div><p role="status" class="sr-only"><span>Deleted: ${jobs[0].name}</span></p>`);
  });
});

describe("jobAfter", () => {
  const ids = ["a", "b", "c", "d"];

  it("moves on to the next job still in the list", () => {
    expect(jobAfter(ids, "b", ["b"])).toBe("c");
    expect(jobAfter(ids, "b", ["b", "c"])).toBe("d");
  });

  it("goes back to the job before when the last one in the list goes", () => {
    expect(jobAfter(ids, "d", ["d"])).toBe("c");
    expect(jobAfter(ids, "c", ["c", "d"])).toBe("b");
  });

  it("has nowhere to go in the list once every job is deleted", () => {
    expect(jobAfter(ids, "a", ids)).toBeNull();
  });
});
