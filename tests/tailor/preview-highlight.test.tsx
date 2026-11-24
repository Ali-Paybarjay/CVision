// The live CV puts the lines the user approved on Fit, and the suggestions not decided yet in a dashed box, and says
// so under it, with the highlight not in the download (#501, #565). Without `marked` (the overview, the saved page)
// every line stays plain, as in the file. On a line of the last section, only the approved item is on Fit (#543), and
// an item from a suggestion is dashed, never on Fit (#565).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CvPreview } from "@/app/tailor/cv-preview";
import { legendSentence, TailorWorkspace, type GapPrompt } from "@/app/tailor/tailor-workspace";
import { findBrandProblems } from "@/features/tailor/brand-check";
import { buildTailoredCv, changesOnCv, cvHeadings, otherLines } from "@/features/tailor/tailored-cv";
import type { Profile, TailoringChange } from "@/shared/contracts";
import { personas } from "@/shared/sample-data";

vi.mock("@/features/tailor/actions", () => ({ decideChange: vi.fn(), answerGap: vi.fn(), suggestCvChanges: vi.fn(), createCoverLetter: vi.fn(), recordApply: vi.fn() }));

const { profile, jobs } = personas.sara;
const job = jobs[0];
const after = "Built Tableau dashboards for the regional sales team and walked the regional managers through them every Monday";
const approved: TailoringChange = {
  id: "change-1",
  jobId: job.id,
  gapId: "sara-gap-1",
  section: "experience",
  before: "Built Tableau dashboards for the regional sales team",
  after,
  evidence: "Every Monday I walked the regional managers through the dashboard",
  evidenceSource: "follow-up-answer",
  status: "approved",
};
const sentence = legendSentence;

/** The opening tag of the element that holds the text, with the text right after it. */
const holder = (html: string, text: string) => html.slice(0, html.indexOf(text)).match(/<(p|li)( [^>]*)?>$/)?.[0] ?? "";

describe("the preview in step 3 (#501)", () => {
  it("says what the highlight is, and puts the approved line on Fit", () => {
    const html = renderToStaticMarkup(
      <TailorWorkspace job={job} jobUrl={null} label="" profile={profile} prompts={[]} savedChanges={[approved]} />,
    );
    const start = html.indexOf('id="preview-heading"');
    expect(start).toBeGreaterThan(-1);
    const preview = html.slice(start, html.indexOf("</aside>", start));

    expect(preview).toContain(sentence);
    expect(preview).toContain(after);
    expect(holder(preview, after)).toContain("bg-fit");
    // Only the approved line: the lines the user did not change stay plain. The key under the CV is not counted.
    const paper = preview.slice(preview.indexOf('aria-label="Your tailored CV"'), preview.indexOf("</article>"));
    expect(paper.split("bg-fit").length - 1).toBe(1);
    // A screen reader still hears which line was tailored.
    expect(preview).toContain("(tailored for this job)");
  });
});

describe("the preview anywhere else", () => {
  const cv = buildTailoredCv(profile, [approved], job);

  it("has no highlight without marked, as in the download", () => {
    const html = renderToStaticMarkup(<CvPreview cv={cv} />);
    expect(html).toContain(after);
    expect(html).not.toContain("bg-fit");
    expect(html).toContain("(tailored for this job)");
  });

  it("puts the approved line, and only it, on Fit with marked", () => {
    const html = renderToStaticMarkup(<CvPreview cv={cv} marked />);
    expect(holder(html, after)).toContain("bg-fit");
    expect(html.split("bg-fit").length - 1).toBe(1);
  });
});

describe("an approved item on a line of the last section (#543)", () => {
  const withLastSection = { ...profile, skills: ["Excel", "SQL", "Tableau"], certifications: [{ name: "PRINCE2 Foundation", year: 2023 }], languages: [{ name: "Welsh", level: "Fluent" }] };
  const added = (section: TailoringChange["section"], text: string): TailoringChange => ({ ...approved, id: `new-${text}`, section, before: null, after: text });

  it.each([
    ["a tool", "Skills and tools:", added("skills", "Power BI"), ["Excel", "SQL", "Tableau"]],
    ["a certificate", "Certificates:", added("certifications", "Google Data Analytics Certificate"), ["PRINCE2 Foundation (2023)"]],
    ["a language", "Languages:", added("skills", "Spanish (Conversational)"), ["Welsh (Fluent)"]],
  ] as const)("puts only %s the user approved on Fit, not the whole line", (_, label, change, others) => {
    const html = renderToStaticMarkup(<CvPreview cv={buildTailoredCv(withLastSection, [change], job)} marked />);
    // Only the approved item is marked, with the screen reader note inside it, so a focused item says so too (#565).
    expect(html).toMatch(new RegExp(`<mark class="[^"]*bg-fit[^"]*">${change.after.replace(/[()]/g, "\\$&")}<span class="sr-only"> \\(tailored for this job\\)</span></mark>`));
    expect(html.split("bg-fit").length - 1).toBe(1);
    // The line itself is plain, and so are the items the user did not change.
    const line = html.slice(html.indexOf(`<p><strong>${label} </strong>`));
    expect(line).not.toBe(html);
    for (const item of others) expect(line.slice(0, line.indexOf("</p>"))).toContain(item);
    expect(html).not.toMatch(/<mark[^>]*>(Excel|SQL|Tableau|PRINCE2|Welsh)/);
  });

  it("marks nothing without marked, and the line reads as the file prints it", () => {
    const cv = buildTailoredCv(withLastSection, [added("skills", "Power BI")], job);
    const html = renderToStaticMarkup(<CvPreview cv={cv} />);
    expect(html).not.toContain("<mark");
    expect(html).not.toContain("bg-fit");
    expect(html).toContain("(tailored for this job)");
    const tools = html.slice(html.indexOf("<p><strong>Skills and tools: </strong>"));
    const file = otherLines(cv).find((line) => line.label === "Skills and tools:");
    expect(file?.text).toMatch(/^Power BI, /);
    expect(tools.slice(0, tools.indexOf("</p>")).replace(/<[^>]+>|\(tailored for this job\)/g, "").replace(/\s+,/g, ",").trim()).toBe(`Skills and tools: ${file?.text}`);
  });
});

describe("the live CV beside the questions (#559)", () => {
  const live = (changes: TailoringChange[]) => {
    const html = renderToStaticMarkup(<TailorWorkspace job={job} jobUrl={null} label="" profile={profile} prompts={[]} savedChanges={changes} />);
    const start = html.indexOf('aria-label="Your tailored CV"');
    return html.slice(start, html.indexOf("</article>", start));
  };

  it("shows a suggestion from an answer in a dashed box, before it is approved", () => {
    const paper = live([{ ...approved, status: "proposed" }]);
    expect(paper).toContain(after);
    expect(holder(paper, after)).toBe("");
    expect(paper).toContain("border-dashed");
    expect(paper).toContain("(suggested, not on your CV yet)");
  });

  it("leaves a suggestion from the CV itself off until it is approved, so the answers' lines stand out", () => {
    const paper = live([{ ...approved, gapId: undefined, evidenceSource: "cv", status: "proposed" }]);
    expect(paper).not.toContain(after);
    expect(paper).not.toContain("border-dashed");
  });
});

describe("the key under the live CV (#565)", () => {
  it("says what both marks mean, and that neither is in the download", () => {
    expect(legendSentence).toContain("bar on the left are the changes you approved");
    expect(legendSentence).toContain("Dashed lines are suggestions, not in your CV until you approve them.");
    // The words the main-path e2e test looks for.
    expect(legendSentence).toContain("The highlight is only on this page, not in your download.");
    expect(legendSentence).not.toContain("Highlighted lines are the changes you approved");
    expect(findBrandProblems(legendSentence)).toEqual([]);
  });
});

/** A suggestion from Sara's answer to the Git question, as in the demo (sara-job-1, Question 3). */
const git: TailoringChange = {
  id: "git-1",
  jobId: job.id,
  gapId: "sara-gap-3",
  section: "skills",
  before: null,
  after: "Git and GitHub",
  evidence: "I used Git and GitHub for my MSc dissertation code",
  evidenceSource: "follow-up-answer",
  status: "proposed",
};

/** The live CV beside the questions, and the line of its last section with this label. */
const liveCv = (changes: TailoringChange[], prompts: GapPrompt[] = [], who: Profile = profile) => {
  const html = renderToStaticMarkup(<TailorWorkspace job={job} jobUrl={null} label="" profile={who} prompts={prompts} savedChanges={changes} />);
  const start = html.indexOf('aria-label="Your tailored CV"');
  return { html, paper: html.slice(start, html.indexOf("</article>", start)) };
};
const groupLine = (paper: string, label: string) => {
  const start = paper.indexOf(`<p><strong>${label} </strong>`);
  return start < 0 ? "" : paper.slice(start, paper.indexOf("</p>", start));
};
/** The line as read on the page, without the tag and the screen reader's words. */
const asRead = (line: string) =>
  line
    .replace(/<span class="sr-only">[^<]*<\/span>/g, "")
    .replace(/<span aria-hidden="true"[^>]*>Suggested<\/span>/g, "")
    .replace(/<[^>]+>/g, "");

describe("a suggestion in the last section of the live CV (#565)", () => {
  it("shows a tool from an answer as suggested, never on Fit as if approved", () => {
    const { paper } = liveCv([git]);
    const tools = groupLine(paper, cvHeadings.tools);
    expect(tools).toMatch(
      /<span class="[^"]*border-dashed[^"]*" id="cv-line-git-1" tabindex="-1"><span aria-hidden="true"[^>]*>Suggested<\/span>Git and GitHub<span class="sr-only"> \(suggested, not on your CV yet\)<\/span><\/span>/,
    );
    expect(tools).not.toContain("<mark");
    expect(paper).not.toContain("border-fit-bar");
    expect(paper).not.toContain("(tailored for this job)");
  });

  it("drops one of the user's own tools only as approving it would, and the download keeps them all", () => {
    const tools = (cv: ReturnType<typeof buildTailoredCv>) => otherLines(cv).find((line) => line.label === cvHeadings.tools)?.text;
    const ifApproved = tools(buildTailoredCv(profile, [{ ...git, status: "approved" }], job));
    expect(asRead(groupLine(liveCv([git]).paper, cvHeadings.tools))).toBe(`${cvHeadings.tools} ${ifApproved}`);
    // The download, built from approved changes only, has no Git and keeps the four tools it had.
    const download = buildTailoredCv(profile, [git], job);
    expect(tools(download)).toBe(tools(buildTailoredCv(profile, [], job)));
    expect(tools(download)).not.toContain("Git");
    expect(JSON.stringify(download)).not.toMatch(/changeId|suggested/);
  });

  it("puts the same tool, once approved, on Fit with its id", () => {
    const { paper } = liveCv([{ ...git, status: "approved" }]);
    const tools = groupLine(paper, cvHeadings.tools);
    expect(tools).toMatch(/<mark class="[^"]*bg-fit[^"]*" id="cv-line-git-1" tabindex="-1">Git and GitHub<span class="sr-only"> \(tailored for this job\)<\/span><\/mark>/);
    expect(tools).not.toContain("Suggested");
    expect(tools).not.toContain("border-dashed");
  });

  it.each([
    // A language's text is not the change's: "Welsh – Fluent" is printed "Welsh (Fluent)".
    ["a language", cvHeadings.languages, { section: "skills", after: "Welsh – Fluent" }, "Welsh (Fluent)"],
    ["a certificate", cvHeadings.certificates, { section: "certifications", after: "CSCS card" }, "CSCS card"],
    // "Full UK driving licence" is printed "Full UK" after "Driving licence:".
    ["a driving licence", cvHeadings.drivingLicence, { section: "skills", after: "Full UK driving licence" }, "Full UK"],
  ] as const)("shows %s from an answer as suggested too", (_, label, change, printed) => {
    const { paper } = liveCv([{ ...git, id: "item-1", ...change }]);
    const line = groupLine(paper, label);
    expect(line).toContain(`id="cv-line-item-1" tabindex="-1"><span aria-hidden="true"`);
    expect(line).toContain(`Suggested</span>${printed}<span class="sr-only"> (suggested, not on your CV yet)</span></span>`);
    expect(line).not.toContain("<mark");
    expect(paper).not.toContain("(tailored for this job)");
  });

  it("never calls a language the user already lists suggested, when a suggestion repeats it", () => {
    const fluent = { ...profile, languages: [{ name: "English", level: "Fluent" }] };
    const { paper } = liveCv([{ ...git, id: "english-1", after: "English (Fluent)" }], [], fluent);
    const line = groupLine(paper, cvHeadings.languages);
    expect(line).toContain("English (Fluent)");
    expect(line).not.toContain("Suggested");
    expect(line).not.toContain("(suggested, not on your CV yet)");
    expect(line).not.toContain("border-dashed");
    // The download has it once, as the user's own.
    const download = buildTailoredCv(fluent, [{ ...git, id: "english-1", after: "English (Fluent)" }], job);
    expect(download.languages).toEqual([{ text: "English (Fluent)", tailored: false }]);
  });

  it("still lets an approval take over the same language, as before (#543)", () => {
    const fluent = { ...profile, languages: [{ name: "English", level: "Fluent" }] };
    const { paper } = liveCv([{ ...git, id: "english-1", after: "English (Fluent)", status: "approved" }], [], fluent);
    const line = groupLine(paper, cvHeadings.languages);
    expect(line).toMatch(/<mark [^>]*id="cv-line-english-1"[^>]*>English \(Fluent\)<span class="sr-only"> \(tailored for this job\)<\/span><\/mark>/);
    expect(line).not.toContain("Suggested");
  });
});

describe("the changes on the live CV (#565)", () => {
  it("are the approved changes and suggestions it shows, within the limits", () => {
    const fromCv: TailoringChange = { ...git, id: "from-cv", gapId: undefined, after: "Looker", evidenceSource: "cv" };
    const tools = ["Power BI", "DAX", "dbt", "Airflow", "BigQuery"].map((after): TailoringChange => ({ ...git, id: after, gapId: undefined, after, status: "approved" }));
    const live = buildTailoredCv(profile, [git, fromCv, ...tools], job, { suggestions: [git] });
    const onCv = changesOnCv(live);
    expect(onCv.has("git-1")).toBe(true);
    // A suggestion from the CV is not on the live CV until approved, and only four tools fit.
    expect(onCv.has("from-cv")).toBe(false);
    expect([...onCv].filter((id) => id !== "git-1")).toHaveLength(3);
  });
});

describe("See it on your CV (#565)", () => {
  const gaps = personas.sara.match.gaps;
  const prompt = (id: string): GapPrompt => ({ gap: gaps.find((gap) => gap.id === id)!, question: "Have you done this?" });

  it("is on a suggestion whose item is on the live CV, and leads to it", () => {
    const { html } = liveCv([git], [prompt("sara-gap-3")]);
    expect(html).toMatch(/<button[^>]*id="show-git-1"[^>]*>See it on your CV →<\/button>/);
    expect(html).toContain('id="cv-line-git-1"');
  });

  it("is not on a suggestion whose line another approved change holds, and the card says why", () => {
    const fromCv: TailoringChange = { ...approved, id: "from-cv", gapId: undefined, evidenceSource: "cv", after: "Built Tableau dashboards for the regional sales team, used weekly" };
    const { html, paper } = liveCv([fromCv, { ...approved, status: "proposed" }], [prompt("sara-gap-1")]);
    expect(html).not.toContain("See it on your CV");
    expect(html).toContain("Another change you approved is on this line. Approve this one to use it instead.");
    expect(paper).not.toContain(after);
  });

  it("is not on the second of two suggestions to one line, and its card says why", () => {
    const second: TailoringChange = { ...approved, id: "change-2", gapId: "sara-gap-2", after: "Built Tableau dashboards for the regional sales team, refreshed every morning", status: "proposed" };
    const { html, paper } = liveCv([{ ...approved, status: "proposed" }, second], [prompt("sara-gap-1"), prompt("sara-gap-2")]);
    // The first suggestion holds the line on the live CV, and only it leads there.
    expect(paper).toContain(after);
    expect(paper).not.toContain(second.after);
    expect(html).toContain('id="show-change-1"');
    expect(html).not.toContain('id="show-change-2"');
    // Only the second suggestion's cards, in step 2 and in step 3, say another suggestion is on its line; none says an approved change is.
    const note = "Another suggestion is on this line of your CV. Approve this one to use it instead.";
    const notes = [...html.matchAll(new RegExp(note.replace(/\./g, "\\."), "g"))].map((match) => match.index);
    expect(notes).toHaveLength(2);
    expect(findBrandProblems(note)).toEqual([]);
    for (const at of notes) expect(html.lastIndexOf(second.after, at)).toBeGreaterThan(html.lastIndexOf(after, at));
    expect(html).not.toContain("Another change you approved is on this line.");
  });
});
