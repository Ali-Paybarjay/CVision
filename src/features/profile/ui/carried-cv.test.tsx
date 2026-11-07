import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { carryCheckedCv, clearCarriedCv } from "@/shared/carried-cv";
import { personas } from "@/shared/sample-data";
import { ProfileBuilder } from "./profile-builder";
import { UploadStep } from "./upload-step";

// A pilot checked his CV in the CV check, then had to upload it again in Profile (#336). The CV check now carries the
// checked file in the page's memory, and Profile offers it. Render checks; putting the file in the field is tried in a
// browser, since it needs DataTransfer.

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("../actions", () => ({ deleteMyProfileAction: vi.fn() }));

const noop = () => {};
const checked = () => new File(["cv"], "sara-khan-cv.docx");
const savedProfile = { profile: personas.daniel.profile, savedAt: "2026-10-21T10:00:00.000Z", cvFormat: null };

afterEach(() => clearCarriedCv());

describe("the CV carried from the CV check", () => {
  it("is ready in the upload step, with the consent box still to tick", () => {
    const html = renderToStaticMarkup(
      <UploadStep replacing={false} demoMode={false} storage="account" focusHeading={false} onExtracted={noop} carriedFile={checked()} />,
    );
    expect(html).toContain("We’ve added the CV you just checked");
    expect(html).toContain("sara-khan-cv.docx");
    expect(html).toContain("tick the box, then press Read my CV");
    expect(html).not.toMatch(/name="consent"[^>]*checked/);
  });

  it("opens the upload with it when there is no profile yet", () => {
    carryCheckedCv(checked(), "account-a");
    const html = renderToStaticMarkup(<ProfileBuilder demoMode={false} storage={{ kind: "account", initial: null, account: "account-a" }} />);
    expect(html).toContain("We’ve added the CV you just checked");
  });

  // Sign-out in another tab, or an ended session, doesn't reload this tab (#336, end-of-batch review).
  it("never offers it to another account in the same tab", () => {
    carryCheckedCv(checked(), "account-a");
    const html = renderToStaticMarkup(<ProfileBuilder demoMode={false} storage={{ kind: "account", initial: null, account: "account-b" }} />);
    expect(html).not.toContain("We’ve added the CV you just checked");
    expect(html).not.toContain("sara-khan-cv.docx");
  });

  it("isn't offered where the profile isn't kept in an account", () => {
    carryCheckedCv(checked(), "account-a");
    expect(renderToStaticMarkup(<ProfileBuilder demoMode={false} storage={{ kind: "account", initial: null }} />)).not.toContain(
      "We’ve added the CV you just checked",
    );
  });

  it("asks first when there is a profile already, and shows the profile meanwhile", () => {
    carryCheckedCv(checked(), "account-a");
    const html = renderToStaticMarkup(<ProfileBuilder demoMode={false} storage={{ kind: "account", initial: savedProfile, account: "account-a" }} />);
    expect(html).toContain("Use the CV you just checked?");
    expect(html).toContain("Use this CV");
    expect(html).toContain("Keep my profile");
    expect(html).not.toContain("We’ve added the CV you just checked");
  });

  it("says nothing of it when no CV was carried", () => {
    const html = renderToStaticMarkup(<ProfileBuilder demoMode={false} storage={{ kind: "account", initial: savedProfile, account: "account-a" }} />);
    expect(html).not.toContain("Use the CV you just checked?");
  });
});
