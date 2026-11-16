import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { brand } from "@/shared/brand";
import type { Tracker as TrackerData } from "./applications";
import type { JobInProgress } from "./model";
import { Tracker } from "./tracker";

// The dashboard for a signed-in user. With no applications yet: the three brand steps and one button for the next
// step, from where the user stands (cards #179 and #506). Below it, or below the applications, the jobs they have
// checked but not applied for. The list of applications itself is tested in application-list.test.tsx.

const { loadTracker } = vi.hoisted(() => ({ loadTracker: vi.fn() }));
vi.mock("next/cache", () => ({ io: async () => {} }));
vi.mock("./applications", () => ({ loadTracker }));
vi.mock("./actions", () => ({ updateApplication: async () => undefined, closeWithoutNews: async () => undefined }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

type Account = Extract<TrackerData, { kind: "account" }>;

/** The dashboard for a signed-in user with these applications, profile and jobs in progress. */
async function render(account: Partial<Account>) {
  loadTracker.mockResolvedValue({ kind: "account", items: [], hasProfile: false, inProgress: [], ...account } satisfies Account);
  return renderToStaticMarkup(await Tracker());
}

// Newest first, as loadTracker gives them.
const graduate: JobInProgress = { id: "job-2", title: "Graduate Data Analyst", company: "Irwell Energy", hasCv: true };
const junior: JobInProgress = { id: "job-1", title: "Junior Data Analyst", company: "Pennine Health Analytics", hasCv: false };

describe("the dashboard's empty tracker", () => {
  it("shows the three brand steps and a button that leads to the profile page", async () => {
    const html = await render({ hasProfile: false });

    expect(html).toContain("No applications yet");
    for (const step of brand.steps) expect(html).toContain(step.title);
    expect(html).toMatch(/<a href="\/profile"[^>]*>Build your profile<\/a>/);
    expect(html).not.toMatch(/>Done</);
  });

  it("sends a user with a profile and no job to check a job ad, and marks the profile step done (#506)", async () => {
    const html = await render({ hasProfile: true });

    expect(html).toMatch(/<a href="\/jobs" class="[^"]*bg-cta[^"]*">Check a job ad<\/a>/);
    expect(html.match(/bg-cta/g)).toHaveLength(1);
    expect(html).not.toContain('href="/profile"');
    // With an icon, beside step 1 only.
    expect(html).toMatch(/Build your profile\.<\/h3><p[^>]*><svg[\s\S]*?<\/svg>Done<\/p>/);
    expect(html.match(/>Done</g)).toHaveLength(1);
    expect(html).not.toContain("Jobs in progress");
  });

  it("puts the one Coral button on the newest job once there is a profile and a job, not on the card (#506)", async () => {
    const html = await render({ hasProfile: true, inProgress: [graduate, junior] });

    expect(html).toContain("No applications yet");
    expect(html).toContain(`${brand.steps[0].title}</h3>`);
    expect(html).not.toContain('href="/profile"');
    expect(html).not.toContain('href="/jobs"');
    expect(html.match(/bg-cta/g)).toHaveLength(1);
    expect(html).toMatch(/<a href="\/tailor\?job=job-2" class="[^"]*bg-cta[^"]*">Carry on tailoring</);
    // All three steps done: a profile, a job checked and a CV saved for it.
    expect(html.match(/>Done</g)).toHaveLength(3);
  });
});

describe("jobs in progress", () => {
  it("lists each job with a link to carry on tailoring, its saved CV when there is one, and a link to all jobs (#506)", async () => {
    const html = await render({ hasProfile: true, inProgress: [graduate, junior] });

    expect(html).toMatch(/<section aria-labelledby="in-progress-title"[^>]*>.*?<h2 id="in-progress-title"[^>]*>Jobs in progress<\/h2>/);
    expect(html).toContain("Jobs you have checked but not added to your applications yet.");
    expect(html).toContain('<h3 class="text-lg leading-snug">Graduate Data Analyst</h3>');
    expect(html).toContain("Pennine Health Analytics");
    expect(html).toMatch(
      /<a href="\/tailor\?job=job-1" class="[^"]*">Carry on tailoring<span class="sr-only"> your CV for Junior Data Analyst at Pennine Health Analytics<\/span><\/a>/,
    );
    expect(html).toMatch(/<a href="\/tailor\/saved\?job=job-2"[^>]*>CV and cover letter<span class="sr-only"> you saved for Graduate Data Analyst at /);
    expect(html.match(/CV and cover letter</g)).toHaveLength(1);
    expect(html).toMatch(/<a href="\/tailor" class="[^"]*">See all your jobs<\/a>/);
  });

  it("come under the applications, with no Coral button (#506)", async () => {
    const html = await render({
      hasProfile: true,
      items: [{ application: { id: "app-1", jobId: "job-9", date: "2026-11-10", status: "applied", nextStep: null }, job: null }],
      inProgress: [junior],
    });

    expect(html).toContain("Your applications");
    expect(html).toContain("Jobs in progress");
    expect(html.indexOf("Jobs in progress")).toBeGreaterThan(html.indexOf("Your applications"));
    expect(html).toContain('href="/tailor?job=job-1"');
    expect(html).not.toContain("bg-cta");
  });

  it("leave the one Coral button to Build your profile while there is no profile (#506)", async () => {
    const html = await render({ hasProfile: false, inProgress: [junior] });

    expect(html).toMatch(/<a href="\/profile" class="[^"]*bg-cta[^"]*">Build your profile<\/a>/);
    expect(html.match(/bg-cta/g)).toHaveLength(1);
    expect(html).toContain('href="/tailor?job=job-1"');
    // A job is checked, but there is no profile and no CV saved for it: only step 2 is done.
    expect(html).toMatch(/Paste a job ad\.<\/h3><p[^>]*><svg[\s\S]*?<\/svg>Done<\/p>/);
    expect(html.match(/>Done</g)).toHaveLength(1);
  });
});
