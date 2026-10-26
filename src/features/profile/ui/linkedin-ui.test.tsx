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
  return buildLinkedInSuggestions(profile, job, match, suggestByRules(profile, job)).suggestions;
}

/** Suggestions for one of Sara's roles from a written answer, as the model would give them. */
function written(roles: LinkedInAnswer["roles"], profile: Profile = personas.sara.profile): LinkedInSuggestions {
  const { jobs, match } = personas.sara;
  return buildLinkedInSuggestions(profile, jobs[0], match, { roles }).suggestions;
}

function idOf(text: string, profile: Profile = personas.sara.profile): string {
  return profileEvidenceLines(profile).find((item) => item.text === text)?.id ?? "";
}

function results(suggestions: LinkedInSuggestions) {
  return renderToStaticMarkup(<LinkedInResults suggestions={suggestions} focusKey={0} />);
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
    expect(text(html)).toContain("Nothing invented.");
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
      expect(visible).toContain(`Copy the description for ${role.title} at ${role.company}`);
      for (const line of role.lines) {
        expect(visible).toContain(line.text);
        for (const source of line.sources) expect(visible).toContain(source.text);
      }
      if (role.skills.length > 0) expect(visible).toContain(role.skills.join(", "));
    }
    expect(visible).toContain("From your CV:");
    expect(html).not.toContain("bg-cta");
  });

  it.each(names)("lists what %s's CV doesn't show yet, and leads to the profile to add it", (name) => {
    const suggestions = mockSuggestions(name);

    const html = results(suggestions);

    expect(suggestions.notShown.length).toBeGreaterThan(0);
    expect(text(html)).toContain("What your CV doesn’t show yet");
    for (const item of suggestions.notShown) expect(text(html)).toContain(item.requirement);
    expect(html).toContain('href="/profile"');
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
    expect(text(html)).toContain("Highlighted lines are reworded from your CV; the rest are its own words.");
  });

  it("says a line from an answer comes from the answer", () => {
    const answer = personas.sara.profile.followUpAnswers[0].answer;

    const html = results(
      written([
        {
          role: "R1",
          lines: [{ text: "Walked the regional managers through the dashboard every Monday", from: [idOf(answer)] }],
          skills: [],
        },
      ]),
    );

    expect(text(html)).toContain(`From your answer: ${answer}`);
    expect(html).toContain("(reworded from your answer)");
  });

  it("explains LinkedIn's Employment type and the same company, from the CV", () => {
    const trained = "Trained four new starters";

    expect(text(results(written([{ role: "R2", lines: [{ text: trained, from: [idOf(trained)] }], skills: [] }])))).toContain(
      "Your CV says “Customer Assistant (part-time)”. On LinkedIn, the title is “Customer Assistant” and “Part-time” goes under Employment type.",
    );
    expect(text(results(mockSuggestions("daniel")))).toContain(
      "Same company as your Store Manager role: on LinkedIn, add it as another position under Hartley's Home Stores.",
    );
  });

  it("names the roles with nothing to add, and says how many suggestions were left out", () => {
    const suggestions = { ...mockSuggestions("sara"), dropped: 2 };

    const html = text(results(suggestions));

    expect(html).toContain("Nothing to add for this job to Customer Assistant (part-time) at Greenway Foods. Keep it as it is on LinkedIn.");
    expect(html).toContain("We left out 2 suggestions that your CV doesn’t back up.");
  });

  it("says so when no line of the CV speaks to the ad", () => {
    const html = text(results({ roles: [], otherRoles: ["Customer Assistant at Greenway Foods"], notShown: [], dropped: 0 }));

    expect(html).toContain("No line of your CV speaks to this ad’s requirements, so there is nothing to add for this job.");
    expect(html).not.toContain("Nothing to add for this job to");
  });
});
