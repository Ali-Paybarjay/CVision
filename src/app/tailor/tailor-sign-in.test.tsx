import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { personas } from "@/shared/sample-data";
import { AddJobFirst, BuildProfileFirst, TailorSignIn, tailorStart } from "./tailor-sign-in";

// A signed-out pilot on Tailor was told "Build your profile first", which sent them round in a circle (#367).

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

describe("tailorStart", () => {
  it("asks a visitor signed out on the live site to sign in, not to build a profile", () => {
    expect(tailorStart(null, "none")).toBe("sign-in");
  });

  it("asks a signed-in user with no profile to build one", () => {
    expect(tailorStart(null, "account")).toBe("build-profile");
  });

  it("opens Tailor for anyone with a profile, the sample one included", () => {
    expect(tailorStart(personas.sara.profile, "account")).toBe("ready");
    expect(tailorStart(personas.sara.profile, "sample")).toBe("ready");
  });
});

describe("TailorSignIn", () => {
  it("offers both choices, each coming back to this job", () => {
    const html = renderToStaticMarkup(<TailorSignIn jobId="sara-job-1" />);

    expect(html).toMatch(/<h2[^>]*>Sign in to tailor your CV<\/h2>/);
    expect(html).toContain('href="/sign-up?next=%2Ftailor%3Fjob%3Dsara-job-1"');
    expect(html).toContain('href="/sign-in?next=%2Ftailor%3Fjob%3Dsara-job-1"');
    expect(html).not.toContain("Build your profile first");
  });

  it("comes back to Tailor itself when no job was asked for", () => {
    expect(renderToStaticMarkup(<TailorSignIn jobId={null} />)).toContain('href="/sign-in?next=%2Ftailor"');
  });
});

// A signed-in user with no profile, or with no job, saw only a small underlined link (#500).
describe("Tailor's empty states", () => {
  it("leads a user with no profile to build one with a Coral button", () => {
    const html = renderToStaticMarkup(<BuildProfileFirst />);

    expect(html).toContain("Build your profile first");
    expect(html).toMatch(/<a href="\/profile" class="[^"]*bg-cta[^"]*">Build your profile<\/a>/);
    expect(html.match(/<a /g)).toHaveLength(1);
  });

  it("leads a user with no job to paste an ad with a Coral button", () => {
    const html = renderToStaticMarkup(<AddJobFirst />);

    expect(html).toContain("Add a job first");
    expect(html).toMatch(/<a href="\/jobs" class="[^"]*bg-cta[^"]*">Paste a job ad<\/a>/);
    expect(html.match(/<a /g)).toHaveLength(1);
  });
});
