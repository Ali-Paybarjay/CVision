import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CvPaper } from "./cv-paper";
import { MatchMarker } from "./match-marker";
import { RequirementList } from "./requirement-list";
import { SectionLabel } from "./section-label";
import { StatusChip } from "./status-chip";

// Plan A's shared pieces (#276, docs/design/paper-desk).

/** What a screen reader reads: the text, with the hidden words, without the markup. */
const read = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, " ").trim();

describe("SectionLabel", () => {
  it("is small bold capitals in the muted colour, 11px by default and 13px above a page title", () => {
    const html = renderToStaticMarkup(<SectionLabel>The job ad</SectionLabel>);
    expect(html).toMatch(/^<p class="[^"]*uppercase/);
    expect(html).toContain("tracking-[0.1em]");
    expect(html).toContain("text-text-muted");
    expect(html).toContain("text-[11px]");
    expect(renderToStaticMarkup(<SectionLabel size="large">Tailor</SectionLabel>)).toContain("text-[13px]");
  });

  it("can be a heading when it names a section", () => {
    expect(renderToStaticMarkup(<SectionLabel as="h3">Essential</SectionLabel>)).toMatch(/^<h3 /);
  });
});

describe("MatchMarker", () => {
  it("is a Teal circle a screen reader hears as the line's number", () => {
    const html = renderToStaticMarkup(<MatchMarker line={1} />);
    expect(html).toContain("bg-accent");
    expect(html).toContain("text-surface");
    expect(read(html)).toBe("Line 1");
  });

  it("stretches for two digits rather than shrinking them", () => {
    const html = renderToStaticMarkup(<MatchMarker line={12} />);
    expect(html).toContain("min-w-[18px]");
    expect(read(html)).toBe("Line 12");
  });
});

describe("StatusChip", () => {
  it("always has an icon and a word, never colour alone", () => {
    for (const status of ["matched", "tailored", "missing"] as const) {
      const html = renderToStaticMarkup(<StatusChip status={status} />);
      expect(html).toContain('aria-hidden="true"');
      expect(read(html)).toBe({ matched: "Matched", tailored: "Tailored", missing: "Not on your CV" }[status]);
    }
  });

  it("names the line of a tailored requirement", () => {
    expect(read(renderToStaticMarkup(<StatusChip status="tailored" line={1} />))).toBe("Line 1Tailored, line 1");
  });

  it("uses the warning colours for a requirement that is not on the CV", () => {
    const html = renderToStaticMarkup(<StatusChip status="missing" />);
    expect(html).toContain("bg-warning-bg");
    expect(html).toContain("text-warning");
  });
});

describe("RequirementList", () => {
  const groups = [
    {
      title: "Essential",
      items: [
        { text: "Strong SQL", status: "matched" as const, note: "Matched in your experience" },
        { text: "Clear communication", status: "tailored" as const, line: 1, note: "Tailored from your answer" },
      ],
    },
    { title: "Desirable", items: [{ text: "Power BI", status: "missing" as const, note: "Not on your CV. We won’t add it." }] },
    { title: "Nice to have", items: [] },
  ];

  it("labels each group with a heading and leaves out an empty group", () => {
    const html = renderToStaticMarkup(<RequirementList groups={groups} />);
    expect(html.match(/<h3 /g)).toHaveLength(2);
    expect(html).not.toContain("Nice to have");
  });

  it("says each requirement's status in words before the requirement", () => {
    const text = read(renderToStaticMarkup(<RequirementList groups={groups} />));
    expect(text).toContain("Matched: Strong SQL");
    expect(text).toContain("Line 1Tailored: Clear communication");
    expect(text).toContain("Not on your CV: Power BI");
    expect(text).toContain("Not on your CV. We won’t add it.");
  });

  it("puts a tailored requirement on Fit with its line's number", () => {
    const html = renderToStaticMarkup(<RequirementList groups={groups} />);
    expect(html).toMatch(/<li class="[^"]*bg-fit[^"]*">.*?bg-accent.*?Clear communication/);
  });

  it("is smaller in compact cards, and takes another heading level", () => {
    const html = renderToStaticMarkup(<RequirementList groups={groups} size="compact" headingLevel="h4" />);
    expect(html).toContain("gap-2 text-sm");
    expect(html.match(/<h4 /g)).toHaveLength(2);
  });
});

describe("CvPaper shadow", () => {
  it("adds Plan A's paper shadow only when asked", () => {
    expect(renderToStaticMarkup(<CvPaper shadow>CV</CvPaper>)).toContain("shadow-paper");
    expect(renderToStaticMarkup(<CvPaper>CV</CvPaper>)).not.toContain("shadow-paper");
  });
});
