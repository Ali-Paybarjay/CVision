import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Job } from "@/shared/contracts";
import { personas } from "@/shared/sample-data";
import { JobAd } from "./job-ad";

// The page a row's "Job ad" link opens (#208): the full ad as pasted, and not found for any job that is not the
// user's own. Which rows get the link is tested in application-list.test.tsx.

const { getMyJob, getMyDataSource } = vi.hoisted(() => ({ getMyJob: vi.fn(), getMyDataSource: vi.fn() }));
vi.mock("@/features/profile/my-data", () => ({ getMyJob, getMyDataSource }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const jobId = "0b6f3c2e-6a51-4f3e-9d0c-2f1e8a7b4c11";
const job: Job = {
  ...personas.sara.jobs[0],
  id: jobId,
  description: "We are hiring.\n\nYou will:\n- write SQL\n- build dashboards\n\n  Indented line",
};
const notFound = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };

afterEach(() => {
  vi.clearAllMocks();
});

describe("the job ad page", () => {
  it("shows the job's title and company, the whole ad exactly as pasted and a way back to the dashboard", async () => {
    getMyJob.mockResolvedValue(job);
    getMyDataSource.mockResolvedValue("account");

    const html = renderToStaticMarkup(await JobAd({ jobId }));

    expect(getMyJob).toHaveBeenCalledWith(jobId);
    expect(html).toMatch(/<h1[^>]*>Junior Data Analyst<\/h1>/);
    expect(html).toContain("Pennine Health Analytics");
    // Every paragraph, line break and space stays, in a block that keeps them.
    expect(html).toContain(`whitespace-pre-wrap break-words">${job.description}</div>`);
    expect(html).toContain("As you pasted it, word for word.");
    expect(html).toMatch(/<a href="\/dashboard"[^>]*>Back to your dashboard<\/a>/);
  });

  it("opens Sara's sample jobs while there are no accounts", async () => {
    const sample = personas.sara.jobs[1];
    getMyJob.mockResolvedValue(sample);
    getMyDataSource.mockResolvedValue("sample");

    const html = renderToStaticMarkup(await JobAd({ jobId: sample.id }));

    expect(html).toMatch(new RegExp(`<h1[^>]*>${sample.title}</h1>`));
    expect(html).toContain("Sara&#x27;s sample ad, as she pasted it.");
  });

  it("is not found for a job that is missing or another user's, which row-level security keeps out", async () => {
    getMyJob.mockResolvedValue(null);
    getMyDataSource.mockResolvedValue("account");

    await expect(JobAd({ jobId })).rejects.toMatchObject(notFound);
  });

  it("is not found for an unknown id in sample mode, where the sample data answers with Sara's first job", async () => {
    getMyJob.mockResolvedValue(personas.sara.jobs[0]);
    getMyDataSource.mockResolvedValue("sample");

    await expect(JobAd({ jobId: "no-such-job" })).rejects.toMatchObject(notFound);
  });
});
