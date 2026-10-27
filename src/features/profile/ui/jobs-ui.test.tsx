import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Job, MatchResult } from "@/shared/contracts";
import { brand } from "@/shared/brand";
import { personas } from "@/shared/sample-data";
import { formatSalary, jobFacts } from "./format";
import { JobChecker, JobForm, ProfileFirst } from "./job-checker";
import { fitLabel, MatchReport } from "./match-report";

// Render checks for the jobs page: they catch crashes and missing content.

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("../job-actions", () => ({ checkJobAction: vi.fn() }));

const noop = () => {};
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ");

const { jobs, match } = personas.sara;
const job = jobs[0];

function report(overrides: Partial<React.ComponentProps<typeof MatchReport>> = {}) {
  return renderToStaticMarkup(
    <MatchReport job={job} match={match} saved="saved" demo={null} focusHeading={false} onCheckAnother={noop} {...overrides} />,
  );
}

describe("MatchReport", () => {
  it("shows the job, the score with a label, and the reasoning", () => {
    const html = text(report());

    expect(html).toContain("Junior Data Analyst");
    expect(html).toContain("Pennine Health Analytics");
    expect(html).toContain("Manchester · £29,000 to £32,000 a year · Permanent · Full-time · Hybrid");
    expect(html).toContain("72 out of 100");
    expect(html).toContain("Partial fit");
    expect(html).toContain(match.reasoning);
    expect(html).toContain("essential requirements count three times as much as desirable ones");
  });

  it("quotes the profile line behind each strength", () => {
    const html = text(report());

    for (const strength of match.strengths) {
      expect(html).toContain(strength.requirement);
      expect(html).toContain(strength.evidence);
    }
  });

  it("lists the gaps, essential first, each with its detail", () => {
    const html = text(report());

    expect(html).toContain("Essential (1)");
    expect(html).toContain("Desirable (2)");
    const essential = html.indexOf("Essential (1)");
    const desirable = html.indexOf("Desirable (2)");
    expect(essential).toBeLessThan(desirable);
    expect(html.indexOf("Clear communication with non-technical stakeholders", essential)).toBeLessThan(desirable);
    for (const gap of match.gaps) expect(html).toContain(gap.detail);
  });

  it("leads on to tailoring this job, as the one main button", () => {
    const html = report();

    expect(html).toContain(`href="/tailor?job=${job.id}"`);
    expect(html.match(/bg-cta/g)).toHaveLength(1);
    expect(text(html)).toContain("Open the original ad");
  });

  it("asks a signed-out visitor to sign in to keep the job, and says when saving failed", () => {
    expect(text(report({ saved: "signed-out" }))).toContain("Sign in to keep this job");
    expect(report({ saved: "signed-out" })).toContain('href="/sign-in?next=%2Fjobs"');
    expect(text(report({ saved: "failed" }))).toContain("This job isn’t saved to your account");
    expect(text(report({ saved: "saved" }))).not.toContain("Sign in");
  });

  it("says so in demo mode, naming the sample profile when one was used", () => {
    const html = text(report({ demo: { sampleProfile: "Sara Khan" } }));

    expect(html).toContain("Demo mode: sample job and simple rules");
    expect(html).toContain("this uses Sara Khan’s sample profile");
  });

  it("shows no score for an ad with no requirements", () => {
    const empty: MatchResult = { ...match, score: 0, strengths: [], gaps: [], uncoveredRequirements: [], reasoning: "No list." };

    const html = text(report({ match: empty }));

    expect(html).not.toContain("out of 100");
    expect(html).toContain("No list.");
  });

  it("uses none of the brand's banned words", () => {
    const html = text(report({ demo: { sampleProfile: "Sara Khan" }, saved: "signed-out" })).toLowerCase();
    for (const phrase of brand.bannedPhrases) expect(html).not.toContain(phrase.toLowerCase());
  });

  it("offers tailoring only for a job /tailor can open: a saved one, or the sample job in the demo", () => {
    const tailor = /href="\/tailor\?job=/;
    const demo = { sampleProfile: null };

    expect(report({ saved: "saved" })).toMatch(tailor);
    expect(report({ saved: "signed-out", demo })).toMatch(tailor);
    expect(report({ saved: "unavailable", demo })).toMatch(tailor);
    expect(report({ saved: "failed" })).not.toMatch(tailor);
    expect(report({ saved: "failed", demo })).not.toMatch(tailor);
    expect(report({ saved: "unavailable" })).not.toMatch(tailor);
    expect(text(report({ saved: "failed" }))).toContain("To tailor your CV for this job, check it again in a minute.");
  });
});

describe("JobForm", () => {
  it("asks for the ad and an optional link, and names the profile it compares with", () => {
    const html = renderToStaticMarkup(<JobForm profile={personas.reza.profile} demoMode={false} focusAd={false} onChecked={noop} />);

    expect(html).toMatch(/<textarea[^>]*name="ad"/);
    expect(html).toMatch(/<input(?=[^>]*name="url")(?=[^>]*type="url")[^>]*>/);
    expect(text(html)).toContain("Link to the ad (optional)");
    expect(text(html)).toContain("the profile you approved for Reza Karimi");
    expect(text(html)).toContain("Check my fit");
    expect(text(html)).not.toContain("Demo mode");
  });

  it("warns in demo mode, and says when the sample profile will be used", () => {
    const html = text(renderToStaticMarkup(<JobForm profile={null} demoMode focusAd={false} onChecked={noop} />));

    expect(html).toContain("Demo mode: the match uses sample data");
    expect(html).toContain("the match uses the sample person’s profile");
  });

  it("shows the ad and its link again after Back from the report", () => {
    const html = renderToStaticMarkup(
      <JobForm
        profile={personas.reza.profile}
        demoMode={false}
        initial={{ ad: "Maths Teacher at Riverside Academy", url: "https://example.com/jobs/42" }}
        focusAd={false}
        onChecked={noop}
      />,
    );

    expect(html).toMatch(/<textarea[^>]*name="ad"[^>]*>Maths Teacher at Riverside Academy<\/textarea>/);
    expect(html).toMatch(/<input(?=[^>]*name="url")(?=[^>]*value="https:\/\/example.com\/jobs\/42")[^>]*>/);
  });
});

describe("JobChecker", () => {
  it("shows a loading state until the browser has read the saved profile", () => {
    expect(text(renderToStaticMarkup(<JobChecker demoMode={false} />))).toContain("Loading your profile…");
  });

  it("compares with the profile saved in the account, without waiting for the browser", () => {
    const html = text(renderToStaticMarkup(<JobChecker demoMode={false} source={{ kind: "account", profile: personas.emma.profile }} />));

    expect(html).toContain("the profile you approved for Emma Walsh");
    expect(html).not.toContain("Loading your profile…");
  });

  it.each([
    ["the ad form", { kind: "account", profile: personas.emma.profile }],
    ["the profile-first message", { kind: "account", profile: null }],
    ["the sign-in message", { kind: "signed-out" }],
  ] as const)("puts Back first on %s, leading out of the page", (_, source) => {
    const html = renderToStaticMarkup(<JobChecker demoMode={false} source={source} />);

    expect(html).toMatch(/^<div[^>]*><a href="\/profile"[^>]*>.*?Back<\/a>/);
  });

  it("asks an account with no profile yet to build one first", () => {
    expect(text(renderToStaticMarkup(<JobChecker demoMode={false} source={{ kind: "account", profile: null }} />))).toContain(
      "Your profile comes first",
    );
  });

  it("asks a signed-out visitor to sign in, but keeps the demo open to them", () => {
    expect(text(renderToStaticMarkup(<JobChecker demoMode={false} source={{ kind: "signed-out" }} />))).toContain(
      "Sign in to check a job against your profile",
    );
    expect(renderToStaticMarkup(<JobChecker demoMode={false} source={{ kind: "signed-out" }} />)).toContain(
      'href="/sign-up?next=%2Fjobs"',
    );
    expect(text(renderToStaticMarkup(<JobChecker demoMode source={{ kind: "signed-out" }} />))).toContain(
      "the match uses the sample person’s profile",
    );
  });

  it("sends a visitor with no profile to the profile page first, with or without a CV", () => {
    const html = renderToStaticMarkup(<ProfileFirst />);

    expect(text(html)).toContain("Your profile comes first");
    expect(text(html)).toContain("Upload your CV or fill in your details to build it.");
    expect(html).toContain('href="/profile"');
  });
});

describe("fitLabel", () => {
  it("puts a plain label next to the score", () => {
    expect([fitLabel(90), fitLabel(75), fitLabel(74), fitLabel(50), fitLabel(49)]).toEqual([
      "Strong fit",
      "Strong fit",
      "Partial fit",
      "Partial fit",
      "Several gaps",
    ]);
  });
});

describe("job formatting", () => {
  const salary = (min?: number, max?: number, period: "year" | "day" | "hour" = "year") => ({
    min,
    max,
    currency: "GBP" as const,
    period,
    isEstimate: false,
  });

  it("writes pay the UK way", () => {
    expect(formatSalary(salary(27500, 27500))).toBe("£27,500 a year");
    expect(formatSalary(salary(450, undefined, "day"))).toBe("From £450 a day");
    expect(formatSalary(salary(undefined, 12.5, "hour"))).toBe("Up to £12.50 an hour");
    expect(formatSalary({ ...salary(30000, 35000), isEstimate: true })).toBe("£30,000 to £35,000 a year (estimate)");
    expect(formatSalary(null)).toBe("");
  });

  it("lists only the facts the ad gives, without saying remote twice", () => {
    const remote: Job = { ...job, location: "Remote (UK)", salary: null, contractType: null, hours: null, workMode: "remote" };

    expect(jobFacts(remote)).toEqual(["Remote (UK)"]);
  });
});
