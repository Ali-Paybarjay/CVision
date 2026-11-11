import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChangeCard } from "@/app/tailor/change-card";
import type { TailoringChange } from "@/shared/contracts";

const change = (before: string | null): TailoringChange => ({
  id: "c1",
  jobId: "j",
  section: "skills",
  before,
  after: "Problem solving",
  evidence: "Solved stock issues at the shop.",
  evidenceSource: "cv",
  status: "proposed",
});
const card = (before: string | null) => renderToStaticMarkup(<ChangeCard change={change(before)} onDecide={async () => {}} />);

describe("the change card (#299)", () => {
  it("strikes through the old line when a line is rewritten", () => {
    const html = card("Good at problems");
    expect(html).toContain("Before");
    expect(html).toMatch(/line-through[^>]*>Good at problems</);
  });

  it("says a new line removes nothing, with nothing struck through", () => {
    for (const before of [null, "  "]) {
      const html = card(before);
      expect(html).toContain("New line");
      expect(html).toContain("Nothing is removed.");
      expect(html).not.toContain("line-through");
      expect(html).not.toContain(">Before<");
    }
  });
});

describe("a new work line on its card (#446)", () => {
  it("names the role it goes under", () => {
    const html = renderToStaticMarkup(
      <ChangeCard change={{ ...change(null), section: "experience" }} onDecide={async () => {}} role="Customer Assistant (part-time), Greenway Foods" />,
    );
    expect(html).toContain("This line is added under Customer Assistant (part-time), Greenway Foods. Nothing is removed.");
  });
});
