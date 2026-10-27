import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { brand } from "@/shared/brand";
import type { Job, Profile } from "@/shared/contracts";
import { personas, type PersonaName } from "@/shared/sample-data";
import { buildLinkedInSuggestions, suggestByRules, type LinkedInAnswer, type LinkedInSuggestions } from "../linkedin";
import { profileEvidenceLines } from "../match";
import { LinkedInResults, LinkedInSuggester } from "./linkedin-suggester";

// Render checks for /jobs/linkedin: they catch crashes and missing content.

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("../linkedin-actions", () => ({ suggestLinkedInAction: vi.fn() }));

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ");

const names = Object.keys(personas) as PersonaName[];

/** The demo's suggestions for a persona's first job, as the page shows them. */
function mockSuggestions(name: PersonaName, job: Job = personas[name].jobs[0]): LinkedInSuggestions {
  const { profile, match } = personas[name];
  return buildLinkedInSuggestions(profile, job, match, suggestByRules(profile, job, match)).suggestions;
}

/** Suggestions from a written answer, as the model would give them. */
function written(roles: LinkedInAnswer["roles"], name: PersonaName = "sara"): LinkedInSuggestions {
  const { profile, jobs, match } = personas[name];
  return buildLinkedInSuggestions(profile, jobs[0], match, { roles }).suggestions;
}

function idOf(text: string, profile: Profile = personas.sara.profile): string {
  return profileEvidenceLines(profile).find((item) => item.text === text)?.id ?? "";
}

function results(suggestions: LinkedInSuggestions, sampleName: string | null = null) {
  return renderToStaticMarkup(<LinkedInResults suggestions={suggestions} focusKey={0} sampleName={sampleName} />);
}

function suggester(props: Partial<React.ComponentProps<typeof LinkedInSuggester>> = {}) {
  return renderToStaticMarkup(
    <LinkedInSuggester jobId="sara-job-1" here="/jobs/linkedin?job=sara-job-1" demoMode={false} sampleName={null} {...props} />,
  );
}

describe("LinkedInSuggester", () => {
  it("offers one main button, and says nothing goes to LinkedIn and every line comes from the CV", () => {
    const html = suggester();

    expect(html.match(/bg-cta/g)).toHaveLength(1);
    expect(text(html)).toContain("Suggest my LinkedIn lines");
    expect(text(html)).toContain("We never post to LinkedIn.");
    expect(text(html)).toContain("the part of your CV or the answer it comes from. Nothing invented.");
    expect(text(html)).not.toContain("Demo mode");
    expect(text(html)).not.toContain("Suggest again");
  });

  it("says so in demo mode, and names whose sample CV the lines come from", () => {
    expect(text(suggester({ demoMode: true }))).toContain("Demo mode: lines straight from the CV");
    expect(text(suggester({ demoMode: true, sampleName: "Sara Khan" }))).toContain("This uses Sara Khan’s sample CV, not yours.");
    expect(text(suggester({ sampleName: "Sara Khan" }))).toContain("This uses Sara Khan’s sample CV, not yours");
  });
});

describe("LinkedInResults", () => {
  it.each(names)("shows %s's roles with their lines, where each comes from, and their skills", (name) => {
    const suggestions = mockSuggestions(name);

    const html = results(suggestions);
    const visible = text(html);

    expect(suggestions.roles.length).toBeGreaterThan(0);
    for (const role of suggestions.roles) {
      expect(html).toContain(`<h3 id="linkedin-${role.id}"`);
      expect(visible).toContain(role.title);
      expect(visible).toContain(role.company);
      expect(visible).toContain(role.period);
      expect(visible).toContain(`Copy the lines for ${role.title} at ${role.company}`);
      for (const line of role.lines) {
        expect(visible).toContain(line.text);
        for (const source of line.sources) expect(visible).toContain(source.text);
      }
      if (role.skills.length > 0) expect(visible).toContain(role.skills.join(", "));
    }
    expect(visible).toContain("From your CV:");
    expect(visible).toContain("Lines to add to this position");
    expect(visible).toContain("If this position is already on LinkedIn, keep its description and add any of these it doesn’t have");
    expect(html).not.toContain("bg-cta");
  });

  it.each(names)("lists what %s's CV doesn't show yet, by what to do about it, and leads to the profile", (name) => {
    const suggestions = mockSuggestions(name);

    const html = results(suggestions);

    expect(suggestions.notShown.length).toBeGreaterThan(0);
    expect(text(html)).toContain("What your CV doesn’t show yet");
    for (const item of suggestions.notShown) expect(text(html)).toContain(item.requirement);
    if (suggestions.notShown.some((item) => item.kind === "missing")) expect(text(html)).toContain("Not on your CV");
    if (suggestions.notShown.some((item) => item.kind === "unclear")) expect(text(html)).toContain("Your CV touches on these.");
    expect(html).toContain('href="/profile"');
  });

  it("names a sample person's gaps as theirs, without sending the visitor to edit a profile", () => {
    const html = text(results(mockSuggestions("sara"), "Sara Khan"));
    const gaps = html.slice(html.indexOf("What the CV doesn’t show yet"));

    expect(gaps).toContain("The ad also asks for these, and Sara Khan’s sample CV doesn’t show them clearly.");
    expect(gaps).toContain("Not on the CV (3)");
    expect(gaps).toContain("Not clear on the CV (1)");
    expect(gaps).not.toContain("your CV");
    expect(html).not.toContain("Go to my profile");
  });

  it("uses none of the brand's banned words", () => {
    for (const name of names) {
      const html = text(results(mockSuggestions(name))).toLowerCase();
      for (const phrase of brand.bannedPhrases) expect(html).not.toContain(phrase.toLowerCase());
    }
  });

  it("highlights a reworded line, keeps the CV's own words plain, and says which is which", () => {
    const dashboards = "Built Tableau dashboards for the regional sales team";
    const report = "Automated a weekly stock report, cutting preparation time from 4 hours to 30 minutes";

    const html = results(
      written([
        {
          role: "R1",
          lines: [
            { text: dashboards, from: [idOf(dashboards)] },
            { text: "Automated the weekly stock report, cutting prep time from 4 hours to 30 minutes", from: [idOf(report)] },
          ],
          skills: [],
        },
      ]),
    );

    expect(html).toMatch(/<p>Built Tableau dashboards for the regional sales team<\/p>/);
    expect(html).toMatch(
      /border-fit-bar[^>]*>Automated the weekly stock report, cutting prep time from 4 hours to 30 minutes<span class="sr-only"> \(reworded from your CV\)/,
    );
    expect(text(html)).toContain("Highlighted lines are reworded; the rest are your own words.");
  });

  it("labels each source by where it comes from: the CV or an answer", () => {
    const answer = personas.sara.profile.followUpAnswers[0].answer;
    const dashboards = "Built Tableau dashboards for the regional sales team";

    const html = results(
      written([
        {
          role: "R1",
          lines: [
            { text: "Walked the regional managers through the dashboard every Monday", from: [idOf(answer)] },
            {
              text: "Built Tableau dashboards for the regional sales team and walked the regional managers through the dashboard every Monday",
              from: [idOf(dashboards), idOf(answer)],
            },
          ],
          skills: [],
        },
      ]),
    );

    expect(text(html)).toContain(`From your answer: ${answer}`);
    expect(text(html)).toContain(`From your CV: ${dashboards} · From your answer: ${answer}`);
    expect(html).toContain("(reworded from your answer)");
    expect(html).toContain("(reworded from your CV and your answer)");
  });

  it("explains LinkedIn's Employment type and the same company, from the CV", () => {
    const trained = "Trained four new starters";
    const covered = "Covered the store manager's role during absences";

    expect(text(results(written([{ role: "R2", lines: [{ text: trained, from: [idOf(trained)] }], skills: [] }])))).toContain(
      "Your CV says “Customer Assistant (part-time)”. On LinkedIn, the title is “Customer Assistant” and “Part-time” goes under Employment type.",
    );
    const daniel = written([{ role: "R2", lines: [{ text: covered, from: [idOf(covered, personas.daniel.profile)] }], skills: [] }], "daniel");
    expect(text(results(daniel))).toContain(
      "Same company as your Store Manager role: on LinkedIn, add it as another position under Hartley's Home Stores.",
    );
  });

  it("names the roles with nothing to add, and says how many suggestions were left out", () => {
    const suggestions = { ...mockSuggestions("sara"), dropped: 2 };

    const html = text(results(suggestions));

    expect(html).toContain("Nothing to add for this job to Customer Assistant (part-time) at Greenway Foods. Keep it as it is on LinkedIn.");
    expect(html).toContain("We left out 2 suggestions that we couldn’t check against your CV.");
  });

  it("says why there is nothing to add: no line speaks to the ad, or none could be checked", () => {
    const none = text(results({ roles: [], otherRoles: ["Customer Assistant at Greenway Foods"], notShown: [], dropped: 0 }));
    const dropped = text(results({ roles: [], otherRoles: ["Customer Assistant at Greenway Foods"], notShown: [], dropped: 2 }));

    expect(none).toContain("No line of your CV speaks to this ad’s requirements, so there is nothing to add for this job.");
    expect(none).not.toContain("Nothing to add for this job to");
    expect(dropped).toContain("We wrote 2 lines for this job, but none stayed close enough to your CV to keep. Try Suggest again.");
    expect(dropped).not.toContain("No line of your CV speaks");
    expect(dropped).not.toContain("We left out");
  });
});
