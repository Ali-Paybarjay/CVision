import { isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { brand } from "@/shared/brand";
import { AccountDeletedView, notDeletedStraightAway } from "./account-deleted";
import { signOut } from "./actions";
import { userTables, type DataSummary } from "./data-rights";
import { DeleteAccountForm } from "./delete-account-form";
import { SignOutButton } from "./sign-out-button";
import { DataRightsView } from "./your-data";

// Render checks for the data-rights screens (issue #43). Deleting, downloading and clearing are tested in
// data-rights.test.ts, data-rights-actions.test.ts and the download route's test.

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("./actions", () => ({ signOut: vi.fn() }));
vi.mock("./data-rights-actions", () => ({ deleteMyAccount: vi.fn() }));
vi.mock("./current-user", () => ({ getCurrentUser: vi.fn() }));

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

const summary: DataSummary = {
  rows: { profiles: 1, jobs: 3, match_results: 3, tailoring_changes: 12, interview_sessions: 2, applications: 2, events: 5, ai_usage: 27 },
  cvFiles: 1,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the Your data page", () => {
  const html = renderToStaticMarkup(<DataRightsView email="sara@example.com" summary={summary} downloadFailed={false} />);

  it("shows the count of every table and of the CV files before anything is deleted", () => {
    const counts = [...html.matchAll(/<dd[^>]*>(\d+)<\/dd>/g)].map((match) => Number(match[1]));
    expect(counts).toEqual([...userTables.map((table) => summary.rows[table]), summary.cvFiles]);
    for (const label of ["Profile", "Saved job ads", "Suggested CV changes", "Usage records", "AI usage records", "CV files"]) {
      expect(text(html)).toContain(label);
    }
    expect(text(html)).toContain("sara@example.com");
  });

  it("offers Download my data before Delete my account, as the page's one main button", () => {
    expect(text(html).indexOf("Download my data")).toBeLessThan(text(html).indexOf("Delete my account"));
    expect(html).toContain('action="/dashboard/your-data/download" method="post"');
    expect(html.match(/bg-cta/g)).toHaveLength(1);
  });

  it("links to what is not deleted straight away", () => {
    expect(html).toContain('href="/privacy#not-deleted-straight-away"');
  });

  it("asks for nothing to be typed until Delete my account is pressed", () => {
    expect(html).not.toContain('name="confirmation"');
  });

  it("says when a download failed", () => {
    const failed = renderToStaticMarkup(<DataRightsView email={null} summary={summary} downloadFailed />);
    expect(text(failed)).toContain("We could not prepare your download");
  });

  it("uses no words the brand bans", () => {
    for (const phrase of brand.bannedPhrases) expect(text(html).toLowerCase()).not.toContain(phrase.toLowerCase());
  });
});

describe("DeleteAccountForm", () => {
  it("starts with one button and no notice", () => {
    const html = text(renderToStaticMarkup(<DeleteAccountForm />));
    expect(html).toContain("Delete my account");
    expect(html).not.toContain("Nothing was deleted");
  });
});

describe("the confirmation page", () => {
  const html = text(renderToStaticMarkup(<AccountDeletedView />));

  it("confirms the deletion and says what is not deleted straight away, and for how long", () => {
    expect(html).toContain("Your account is deleted");
    for (const item of notDeletedStraightAway) expect(html).toContain(item.where);
    expect(html).toContain("up to 7 days");
    expect(html).toContain("1 day");
    expect(html).toContain("up to 30 days");
  });

  it("uses no words the brand bans", () => {
    for (const phrase of brand.bannedPhrases) expect(html.toLowerCase()).not.toContain(phrase.toLowerCase());
  });
});

describe("SignOutButton", () => {
  it("posts to the signOut action and clears CVision's data from the browser on the way", () => {
    const items = new Map([
      ["cvision.profile", "{}"],
      ["cvision.interview.v1:sara-job-1", "{}"],
      ["other-site.theme", "dark"],
    ]);
    vi.stubGlobal("window", {
      localStorage: {
        get length() {
          return items.size;
        },
        key: (index: number) => [...items.keys()][index] ?? null,
        removeItem: (key: string) => void items.delete(key),
      },
    });

    const form = SignOutButton() as ReactElement<{ action: unknown; onSubmit: () => void }>;
    expect(isValidElement(form) && form.type).toBe("form");
    expect(form.props.action).toBe(signOut);

    form.props.onSubmit();

    expect([...items.keys()]).toEqual(["other-site.theme"]);
  });
});
