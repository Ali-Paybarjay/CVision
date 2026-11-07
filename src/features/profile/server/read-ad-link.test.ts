import { describe, expect, it, vi } from "vitest";
import { readAdLink } from "./read-ad-link";

// The real fetchPublicPage on pages made up here: fetch and the DNS lookup are stand-ins, so nothing reaches the
// network (CLAUDE.md, rule 10).

const publicLookup = async () => ["93.184.216.34"];

function site(body: string, status = 200) {
  return vi.fn(async () => new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } }));
}

const duties = "You will write SQL to pull data from our warehouse and build weekly dashboards for the clinical teams. ";
const ad = `<!doctype html><html><head><title>Junior Data Analyst | Pennine Health Analytics</title></head>
<body><nav>Jobs · Sign in</nav><h1>Junior Data Analyst</h1><p>${duties.repeat(3)}</p>
<ul><li>Strong SQL</li><li>Excel and Power BI</li></ul><footer>© Pennine Health</footer></body></html>`;

describe("readAdLink", () => {
  it("returns the ad's text from a public page", async () => {
    const fetch = site(ad);

    const read = await readAdLink("https://jobs.example.com/ad/1", { fetch, lookup: publicLookup });

    expect(read).toMatchObject({ ok: true, url: "https://jobs.example.com/ad/1", truncated: false });
    if (!read.ok) throw new Error("expected the ad");
    expect(read.text).toContain("Junior Data Analyst");
    expect(read.text).toContain("Strong SQL\nExcel and Power BI");
  });

  it("never opens a site that doesn't show its ads to other websites", async () => {
    const fetch = site(ad);

    expect(await readAdLink("https://uk.linkedin.com/jobs/view/4012345678", { fetch, lookup: publicLookup })).toEqual({
      ok: false,
      reason: "text-only-site",
      url: "https://uk.linkedin.com/jobs/view/4012345678",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("never asks such a site, even when a shortened link redirects to it", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 301, headers: { location: "https://www.totaljobs.com/job/42" } }));

    expect(await readAdLink("https://bit.ly/3pennine", { fetch, lookup: publicLookup })).toEqual({
      ok: false,
      reason: "text-only-site",
      url: "https://www.totaljobs.com/job/42",
    });
    // Only the short link was asked: Totaljobs never answers, so asking it would cost the user 10 seconds.
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("passes on why a page can't be read", async () => {
    expect(await readAdLink("https://jobs.example.com/ad/1", { fetch: site("Forbidden", 403), lookup: publicLookup })).toEqual({
      ok: false,
      reason: "blocked",
      url: "https://jobs.example.com/ad/1",
    });
    expect(await readAdLink("https://jobs.example.com/ad/1", { fetch: site("Gone", 404), lookup: publicLookup })).toEqual({
      ok: false,
      reason: "not-found",
      url: "https://jobs.example.com/ad/1",
    });
    expect(await readAdLink("http://10.0.0.5/ad/1", { fetch: site(ad), lookup: publicLookup })).toEqual({
      ok: false,
      reason: "invalid-url",
      url: "http://10.0.0.5/ad/1",
    });
  });

  it("counts a page too short to hold a whole ad as no ad", async () => {
    const signIn = "<html><head><title>Sign in</title></head><body><h1>Sign in to see this job</h1></body></html>";

    expect(await readAdLink("https://jobs.example.com/ad/1", { fetch: site(signIn), lookup: publicLookup })).toEqual({
      ok: false,
      reason: "no-ad",
      url: "https://jobs.example.com/ad/1",
    });
  });
});
