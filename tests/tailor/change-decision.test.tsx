// Approve, Reject and Undo on a suggested change, the chip that says which decision stands, and the count in step 3
// (#531). The card is drawn on the server, so each button's onClick is kept as React hands it over, and pressing a
// button is calling it. No network: saving is the page's onDecide, here a list.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChangeCard } from "@/app/tailor/change-card";
import { decideOnLine } from "@/app/tailor/line-decision";
import { TailorWorkspace } from "@/app/tailor/tailor-workspace";
import type { TailoringChange } from "@/shared/contracts";
import { personas } from "@/shared/sample-data";

const buttons = vi.hoisted(() => new Map<string, () => void>());
vi.mock("@/shared/ui", async (importOriginal) => {
  const ui = await importOriginal<typeof import("@/shared/ui")>();
  const { Children } = await import("react");
  return {
    ...ui,
    Button: (props: Parameters<typeof ui.Button>[0]) => {
      const name = Children.toArray(props.children).find((child) => typeof child === "string");
      if (typeof name === "string" && props.onClick) buttons.set(name, props.onClick as () => void);
      return ui.Button(props);
    },
  };
});
// A server render cannot start a transition, so here the saving just runs. A server render fills no ref either, so while
// a test turns `focus.fake` on, a ref that waits for an element holds a stand-in that counts the times it takes focus.
const focus = vi.hoisted(() => ({ fake: false, calls: 0 }));
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return {
    ...react,
    useTransition: () => [false, (callback: () => unknown) => void callback()],
    useRef: (initial: unknown) => (focus.fake && initial === null ? { current: { focus: () => void focus.calls++ } } : react.useRef(initial)),
  };
});
vi.mock("@/features/tailor/actions", () => ({ decideChange: vi.fn(), answerGap: vi.fn(), suggestCvChanges: vi.fn(), createCoverLetter: vi.fn(), recordApply: vi.fn() }));

const change = (status: TailoringChange["status"]): TailoringChange => ({
  id: "change-1",
  jobId: "j",
  section: "experience",
  before: "Built Tableau dashboards for the regional sales team",
  after: "Built Tableau dashboards for the regional sales team and walked the managers through them every Monday",
  evidence: "Every Monday I walked the regional managers through the dashboard",
  evidenceSource: "follow-up-answer",
  status,
});

/** A card as the page draws it, and what pressing one of its buttons hands to the page. */
function card(shown: TailoringChange) {
  buttons.clear();
  const decided: TailoringChange[] = [];
  const html = renderToStaticMarkup(<ChangeCard change={shown} onDecide={async (next) => void decided.push(next)} />);
  const press = (name: string) => {
    const click = buttons.get(name);
    if (!click) throw new Error(`The card has no ${name} button`);
    click();
    return decided.at(-1);
  };
  return { html, press };
}

/** A button's tag by its visible words, with any words only a screen reader hears after them. */
const button = (html: string, name: string) => html.match(new RegExp(`<button[^>]*>${name}(<span class="sr-only">[^<]*</span>)?</button>`))?.[0] ?? "";
/** The decision chip beside the buttons. */
const chip = (html: string) => html.match(/<span class="inline-flex items-center gap-1\.5 rounded-md[^"]*">.*?<\/span>/)?.[0] ?? "";

describe("Undo after a decision (#531)", () => {
  it("shows a quiet Undo after Approve, which a screen reader hears as Undo your decision", () => {
    const undo = button(card(change("approved")).html, "Undo");
    expect(undo).toContain('<span class="sr-only"> your decision</span>');
    expect(undo).toContain("text-accent");
    // Not Coral, and not the outlined button of Approve and Reject.
    expect(undo).not.toContain("bg-cta");
    expect(undo).not.toContain("border-accent");
  });

  it("takes an approved change back to not decided yet, with its line as it was", () => {
    expect(card(change("approved")).press("Undo")).toEqual(change("proposed"));
  });

  it("takes a rejected change back to not decided yet too", () => {
    expect(button(card(change("rejected")).html, "Undo")).not.toBe("");
    expect(card(change("rejected")).press("Undo")).toEqual(change("proposed"));
  });

  it("leaves the card as it was before Approve: both buttons free again, and no Undo", () => {
    const undone = card(change("approved")).press("Undo");
    const { html } = card(undone!);
    for (const name of ["Approve", "Reject"]) {
      expect(button(html, name)).toContain('aria-pressed="false"');
      expect(button(html, name)).not.toContain('disabled=""');
    }
    expect(html).not.toContain("Undo");
    expect(chip(html)).toContain("Not decided yet");
  });

  it("keeps Approve to approve and Reject to switch an approved change, as before", () => {
    expect(card(change("proposed")).press("Approve")?.status).toBe("approved");
    expect(card(change("approved")).press("Reject")?.status).toBe("rejected");
  });

  it("moves focus to the chip as Undo goes away, so the next Tab carries on from this card", () => {
    focus.fake = true;
    try {
      const { html, press } = card(change("approved"));
      expect(html).toMatch(/<span class="[^"]*" aria-live="polite" tabindex="-1"><span class="inline-flex/);
      expect(focus.calls).toBe(0);
      press("Undo");
      expect(focus.calls).toBe(1);
      // Approve and Reject keep focus where it is.
      card(change("proposed")).press("Approve");
      card(change("approved")).press("Reject");
      expect(focus.calls).toBe(1);
    } finally {
      focus.fake = false;
      focus.calls = 0;
    }
  });
});

describe("Undo on a change that replaced another on the same line (#531, #465)", () => {
  const lineA: TailoringChange = { ...change("proposed"), id: "change-a" };
  const lineB: TailoringChange = { ...change("proposed"), id: "change-b", after: "Built Tableau dashboards that the regional managers used every Monday" };
  const statuses = (changes: TailoringChange[]) => Object.fromEntries(changes.map((item) => [item.id, item.status]));

  it("approves the earlier change again, so the line is as it was before the decision", () => {
    const first = decideOnLine([lineA, lineB], { ...lineA, status: "approved" }, null);
    expect(statuses(first.changes)).toEqual({ "change-a": "approved", "change-b": "proposed" });
    expect(first.notes).toBeNull();

    const second = decideOnLine(first.changes, { ...lineB, status: "approved" }, first.notes);
    expect(statuses(second.changes)).toEqual({ "change-a": "proposed", "change-b": "approved" });
    expect(second.notes).toEqual({ approved: "change-b", sentBack: ["change-a"] });

    const undone = decideOnLine(second.changes, { ...lineB, status: "proposed" }, second.notes);
    expect(statuses(undone.changes)).toEqual({ "change-a": "approved", "change-b": "proposed" });
    // Both go to the saved decisions, and neither card keeps a note about the other.
    expect(undone.toSave.map((item) => [item.id, item.status])).toEqual([
      ["change-b", "proposed"],
      ["change-a", "approved"],
    ]);
    expect(undone.notes).toBeNull();
  });

  it("leaves the earlier change where it is after Reject, or after another decision came in between", () => {
    const onLine = [lineA, { ...lineB, status: "approved" as const }];
    const notes = { approved: "change-b", sentBack: ["change-a"] };
    expect(statuses(decideOnLine(onLine, { ...lineB, status: "rejected" }, notes).changes)).toEqual({ "change-a": "proposed", "change-b": "rejected" });
    expect(statuses(decideOnLine(onLine, { ...lineB, status: "proposed" }, null).changes)).toEqual({ "change-a": "proposed", "change-b": "proposed" });
  });

  it("leaves a single Undo as it was: nothing else on the line moves", () => {
    const undone = decideOnLine([{ ...lineA, status: "approved" }, lineB], { ...lineA, status: "proposed" }, null);
    expect(statuses(undone.changes)).toEqual({ "change-a": "proposed", "change-b": "proposed" });
    expect(undone.toSave).toEqual([{ ...lineA, status: "proposed" }]);
  });
});

describe("the decision chip on each change (#531)", () => {
  it("puts Approved on Fit in Teal", () => {
    const shown = chip(card(change("approved")).html);
    expect(shown).toContain("bg-fit text-accent");
    expect(shown).toContain("✓ Approved");
  });

  it("mutes Rejected", () => {
    const shown = chip(card(change("rejected")).html);
    expect(shown).toContain("text-text-muted");
    expect(shown).not.toContain("bg-fit");
    expect(shown).toContain("✕ Rejected");
  });

  it("says Not decided yet, never Waiting, in the warning colour with an icon", () => {
    const { html } = card(change("proposed"));
    const shown = chip(html);
    expect(shown).toContain("bg-warning-bg text-warning");
    expect(shown).toContain('<svg viewBox="0 0 24 24"');
    expect(shown).toContain("Not decided yet");
    expect(html).not.toContain("Waiting");
  });

  it("gives each decision a look of its own, in the live region a screen reader hears", () => {
    const looks = (["approved", "rejected", "proposed"] as const).map((status) => chip(card(change(status)).html).match(/class="([^"]*)"/)?.[1]);
    expect(new Set(looks).size).toBe(3);
    expect(card(change("approved")).html).toMatch(/<span class="[^"]*" aria-live="polite"[^>]*><span class="inline-flex/);
  });

  it("gives an approved card the Teal edge of a tailored line, and the others the usual line", () => {
    expect(card(change("approved")).html).toMatch(/^<div class="[^"]*border-fit-bar"/);
    for (const status of ["proposed", "rejected"] as const) expect(card(change(status)).html).toMatch(/^<div class="[^"]*border-line"/);
  });

  it("keeps the reason beside the chip on a card sent back by another approval (#465)", () => {
    const html = renderToStaticMarkup(<ChangeCard change={change("proposed")} onDecide={async () => {}} lineNote="sent-back" />);
    expect(chip(html)).toContain("Not decided yet");
    expect(html).toContain("Back with your suggestions: you approved another change to this line.");
  });
});

describe("the count in step 3 (#531)", () => {
  const { profile, jobs } = personas.sara;
  const saved = [
    { ...change("approved"), jobId: jobs[0].id },
    { ...change("rejected"), id: "change-2", jobId: jobs[0].id },
    { ...change("proposed"), id: "change-3", jobId: jobs[0].id },
    { ...change("proposed"), id: "change-4", jobId: jobs[0].id },
  ];

  it("uses the chip's words: Not decided yet, not Waiting", () => {
    const html = renderToStaticMarkup(<TailorWorkspace job={jobs[0]} jobUrl={null} label="" profile={profile} prompts={[]} savedChanges={saved} />).replace(
      /<!-- -->/g,
      "",
    );
    expect(html).toContain("✓ Approved: 1</span> · ✕ Rejected: 1 · Not decided yet: 2. Only approved changes go into your CV.");
    expect(html).not.toContain("Waiting:");
  });
});
