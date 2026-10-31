import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { personas, type PersonaName } from "@/shared/sample-data";
import { consentPoints, cvConsent, manualConsent, manualConsentPoints } from "../consent";
import { extractionFromProfile } from "../cv-extraction";
import { draftFromExtraction, draftFromProfile, emptyDraft, reviewReducer, type ReviewDraft } from "../review-draft";
import type { StoredProfile } from "../profile-store";
import { builtFromCv, fromAccount, fromBrowser, type SavedProfile } from "../saved-profile";
import { BackLink } from "./back-link";
import { PreferencesForm } from "./preferences-form";
import { consentToSend, ProfileBuilder } from "./profile-builder";
import { deleteQuestion, ProfileOverview } from "./profile-overview";
import { ReviewStep } from "./review-step";
import { SignInToStart } from "./sign-in-to-start";
import { SignInNotice, UploadStep } from "./upload-step";

// Render checks for each screen of the profile flow: they catch crashes and missing content.
// Clicking through the flow is covered by the reducer tests and by trying it in a browser.

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("../actions", () => ({ deleteMyProfileAction: vi.fn() }));

const noop = () => {};
const names = Object.keys(personas) as PersonaName[];
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

function stored(name: PersonaName): StoredProfile {
  return {
    version: 1,
    profile: personas[name].profile,
    consent: { version: cvConsent.version, givenAt: "2026-10-20T18:00:00.000Z" },
    savedAt: "2026-10-20T18:05:00.000Z",
  };
}

describe("profile screens", () => {
  it("shows a loading state until the browser has read the saved profile", () => {
    expect(text(renderToStaticMarkup(<ProfileBuilder demoMode={false} />))).toContain("Loading your profile…");
  });

  it("asks for consent next to the upload, unticked, saying the profile and file go to the account", () => {
    const html = renderToStaticMarkup(
      <UploadStep replacing={false} demoMode={false} storage="account" focusHeading={false} onExtracted={noop} />,
    );

    expect(text(html)).toContain(cvConsent.label);
    for (const point of consentPoints("account")) expect(text(html)).toContain(point);
    expect(text(html)).toContain("we save it and your CV file to your CVision account");
    expect(text(html)).toContain("through OpenRouter on Google Cloud or Amazon Web Services");
    expect(text(html)).not.toContain("don’t keep");
    expect(html).toMatch(/<a href="\/privacy"[^>]*>Privacy page<\/a>/);
    expect(html).toMatch(new RegExp(`<input type="checkbox"[^>]*name="consent" value="${cvConsent.version}"`));
    expect(html).not.toMatch(/name="consent"[^>]*checked/);
    expect(html).toContain('accept=".pdf,.docx');
    expect(text(html)).not.toContain("Demo mode");
  });

  it("warns before an upload in demo mode that the CV won’t become the profile", () => {
    const html = text(
      renderToStaticMarkup(<UploadStep replacing={false} demoMode storage="browser" focusHeading={false} onExtracted={noop} />),
    );
    expect(html).toContain("Demo mode: your CV won’t become your profile yet");
    expect(html).toContain("Your profile is saved in this browser only");
    expect(html).toContain("sample-data/cvs");
  });

  it("says a new CV changes nothing until its details are approved", () => {
    const html = text(
      renderToStaticMarkup(<UploadStep replacing demoMode={false} storage="account" focusHeading={false} onExtracted={noop} onCancel={noop} />),
    );
    expect(html).toContain("This replaces your current profile");
    expect(html).toContain("Nothing changes until you check the new details and approve them.");
    expect(html).toContain("Keep my current profile");
  });

  it("offers someone with no CV to fill in their details by hand, as the second choice after the upload", () => {
    const html = renderToStaticMarkup(
      <UploadStep replacing={false} demoMode={false} storage="account" focusHeading={false} onExtracted={noop} onStartManual={noop} />,
    );
    const words = text(html);

    expect(words).toContain("No CV to upload?");
    expect(html).toMatch(/<button type="button"[^>]*>Fill in my details<\/button>/);
    expect(words.indexOf("No CV to upload?")).toBeGreaterThan(words.indexOf("Read my CV"));
    // Read my CV stays the page's one main button.
    expect(html.match(/bg-cta/g)).toHaveLength(1);
  });

  it("offers no second choice when the page doesn't ask for one", () => {
    const html = text(
      renderToStaticMarkup(<UploadStep replacing demoMode={false} storage="account" focusHeading={false} onExtracted={noop} onCancel={noop} />),
    );
    expect(html).not.toContain("No CV to upload?");
  });

  it("calls the upload a new CV only when the profile it replaces came from one", () => {
    const heading = (newCv: boolean) =>
      renderToStaticMarkup(
        <UploadStep replacing newCv={newCv} demoMode={false} storage="account" focusHeading={false} onExtracted={noop} onCancel={noop} />,
      ).match(/<h2 id="upload-heading"[^>]*>(.*?)<\/h2>/)?.[1];

    expect(heading(true)).toBe("Upload a new CV");
    expect(heading(false)).toBe("Upload your CV");
  });

  it("points a signed-out visitor to sign in or create an account, then back to the profile page", () => {
    const html = renderToStaticMarkup(<SignInNotice />);

    expect(text(html)).toContain("Sign in to upload your CV");
    expect(html).toContain('href="/sign-in?next=%2Fprofile"');
    expect(html).toContain('href="/sign-up?next=%2Fprofile"');
    expect(text(html)).toContain("you’ll come back to this page");
  });

  it.each(names)("lists every item of %s's CV for review, with one approval at the end of the page", (name) => {
    const profile = personas[name].profile;
    const html = renderToStaticMarkup(
      <ReviewStep
        draft={draftFromExtraction(extractionFromProfile(profile))}
        base={profile}
        source="cv"
        storage="account"
        demo={{ persona: profile.fullName, text: "Text read from the uploaded file" }}
        truncated={false}
        focusHeading={false}
        onSave={noop}
        onCancel={noop}
      />,
    );
    const words = text(html);

    expect(words).toContain("Check your details");
    expect(words).toContain(`Demo mode: this is ${profile.fullName}’s sample profile, not your CV`);
    expect(words).toContain("Text read from the uploaded file");
    for (const job of profile.experience) expect(words).toContain(`${job.title} at ${job.company}`);
    // No Approve button on each item: one for the whole page, after the last section, as the one main button.
    expect(html.match(/<button[^>]*>Approve/g)).toHaveLength(1);
    expect(words.indexOf("Approve and save")).toBeGreaterThan(words.indexOf("Your skills"));
    expect(html.match(/bg-cta/g)).toHaveLength(1);
    expect(words).toContain("Approve your profile");
    expect(words).toContain("Start again");
  });

  it("lists volunteering, projects and languages read from a CV, each next to the section most like it (#227)", () => {
    const profile = {
      ...personas.sara.profile,
      volunteering: [{ role: "Volunteer maths tutor", organisation: "Ancoats Reading Club", startDate: "2023-01", endDate: null, details: [] }],
      projects: [{ name: "Late buses dashboard", details: [], url: "https://example.com/sara/late-buses" }],
      languages: [{ name: "French", level: "B1" }],
    };
    const html = renderToStaticMarkup(
      <ReviewStep
        draft={draftFromExtraction(extractionFromProfile(profile))}
        base={profile}
        source="cv"
        storage="account"
        demo={null}
        truncated={false}
        focusHeading={false}
        onSave={noop}
        onCancel={noop}
      />,
    );
    const words = text(html);
    const headings = ["Work history", "Volunteering", "Education", "Projects", "Certificates", "Languages", "Skills"];
    const at = headings.map((heading) => html.indexOf(`>${heading}</h3>`));

    expect(at).not.toContain(-1);
    expect(at).toEqual([...at].sort((a, b) => a - b));
    expect(words).toContain("Volunteer maths tutor at Ancoats Reading Club");
    expect(words).toContain("I still do this");
    expect(words).toContain("Late buses dashboard");
    expect(html).toMatch(/<input[^>]*type="url"[^>]*value="https:\/\/example.com\/sara\/late-buses"/);
    expect(words).toContain("Level (optional)");
    expect(words).not.toMatch(/We didn’t find any (volunteering|projects|languages)/);
  });

  it("says when a CV has no volunteering, projects or languages, so the user can add them", () => {
    const profile = personas.reza.profile;
    const words = text(
      renderToStaticMarkup(
        <ReviewStep
          draft={draftFromExtraction(extractionFromProfile(profile))}
          base={profile}
          source="cv"
          storage="account"
          demo={null}
          truncated={false}
          focusHeading={false}
          onSave={noop}
          onCancel={noop}
        />,
      ),
    );

    expect(words).toContain("We didn’t find any volunteering in your CV.");
    expect(words).toContain("We didn’t find any projects in your CV.");
    expect(words).toContain("We didn’t find any languages in your CV.");
    for (const label of ["Add a volunteering role", "Add a project", "Add a language"]) expect(words).toContain(label);
  });

  it("asks for the changes to a saved profile to be approved once, or cancelled", () => {
    const profile = personas.emma.profile;
    const html = text(
      renderToStaticMarkup(
        <ReviewStep
          draft={draftFromProfile(profile)}
          base={profile}
          source="saved"
          storage="account"
          demo={null}
          truncated={false}
          focusHeading={false}
          onSave={noop}
          onCancel={noop}
        />,
      ),
    );

    expect(html).toContain("Approve your changes");
    expect(html).toContain("Approve and save");
    expect(html).toContain("Cancel");
    expect(html).not.toContain("Upload your CV");
  });

  it("says when a month is our guess, and leaves missing details empty for the user to fill", () => {
    const extraction = extractionFromProfile(personas.daniel.profile);
    extraction.experience[0] = { ...extraction.experience[0], startDate: "2019", company: "" };
    const html = text(
      renderToStaticMarkup(
        <ReviewStep
          draft={draftFromExtraction(extraction)}
          base={personas.daniel.profile}
          source="cv"
          storage="account"
          demo={null}
          truncated={false}
          focusHeading={false}
          onSave={noop}
          onCancel={noop}
        />,
      ),
    );

    expect(html).toContain("Your CV gives only the year, so we put January. Check the month.");
    expect(html).not.toContain("so we put December");
  });

  // #186: the browser's month box has no picker in Safari or Firefox on a computer, and in Edge its calendar has no
  // year list. Two menus work the same everywhere, with nothing to type.
  it("asks for each date with a Month and a Year menu in a named group, showing the saved date", () => {
    const html = renderToStaticMarkup(
      <ReviewStep
        draft={draftFromProfile(personas.sara.profile)}
        base={personas.sara.profile}
        source="saved"
        storage="account"
        demo={null}
        truncated={false}
        focusHeading={false}
        onSave={noop}
        onCancel={noop}
      />,
    );
    const thisYear = new Date().getFullYear();
    const [startYear, startMonth] = personas.sara.profile.experience[0].startDate.split("-");

    expect(html).not.toContain('type="month"');
    expect(text(html)).not.toContain("YYYY-MM");
    expect(html).toMatch(/<fieldset[^>]*><legend[^>]*>Started<\/legend>/);
    expect(html).toMatch(/<legend[^>]*>Finished \(optional\)<\/legend>/);
    expect(html).toContain(">Month</label>");
    expect(html).toContain(">Year</label>");
    // The saved date is chosen in both menus, and years run newest first from this year.
    expect(html).toContain(`<option value="${startMonth}" selected="">`);
    expect(html).toContain(`<option value="${startYear}" selected="">${startYear}</option>`);
    expect(html).toContain(`<option value="">Year</option><option value="${thisYear}">${thisYear}</option>`);
    // A course's Finished menu goes up to six years from now, and no further.
    expect(html).toContain(`<option value="${thisYear + 6}">${thisYear + 6}</option>`);
    expect(html).not.toContain(`<option value="${thisYear + 7}">`);
  });

  function manualReview(storage: "account" | "browser", draft: ReviewDraft = emptyDraft()) {
    return renderToStaticMarkup(
      <ReviewStep
        draft={draft}
        base={personas.sara.profile}
        source="manual"
        storage={storage}
        demo={null}
        truncated={false}
        focusHeading={false}
        onSave={noop}
        onCancel={noop}
      />,
    );
  }

  it("starts a profile typed in by hand empty, with no mention of a CV the user doesn't have", () => {
    const words = text(manualReview("account"));

    expect(words).toContain("Add your details");
    expect(words).toContain("Fill in each section that applies to you.");
    expect(words).toContain("No jobs yet. Part-time work, volunteering and placements count too.");
    expect(words).toContain("No qualifications yet. GCSEs, A levels, degrees and training courses all count.");
    expect(words).toContain("No certificates yet.");
    expect(words).toContain("No volunteering yet.");
    expect(words).toContain("No projects yet. Course, personal and open-source projects all count.");
    expect(words).toContain("No languages yet.");
    expect(words).toContain("A few sentences about you and the work you want, in your own words.");
    expect(words).not.toMatch(/in your CV|your CV’s|your CV doesn’t|as on your CV/i);
    // A single page, so no steps of the upload.
    expect(words).not.toContain("Upload your CV");
    expect(words).toContain("Upload a CV instead");
  });

  it("asks for a job typed in by hand without pointing to a CV", () => {
    const words = text(manualReview("account", reviewReducer(emptyDraft(), { type: "add", section: "experience", key: "job" })));

    expect(words).toContain("New job");
    expect(words).toContain("What you did One per line.");
    expect(words).not.toMatch(/as on your CV|your CV gives/i);
  });

  it("names the purpose of each contact field, so a phone can fill them in", () => {
    const html = manualReview("account");

    for (const token of ["name", "email", "tel", "address-level2", "url"]) expect(html).toContain(`autoComplete="${token}"`);
  });

  it.each(["account", "browser"] as const)(
    "asks for consent next to Approve before a typed-in profile is saved, unticked and true to where it goes (%s)",
    (storage) => {
      const html = manualReview(storage);
      const words = text(html);

      expect(words).toContain("Before we save your profile");
      for (const point of manualConsentPoints(storage)) expect(words).toContain(point);
      expect(words).toContain(manualConsent.label);
      expect(words).not.toContain(cvConsent.label);
      expect(html).toMatch(/<a href="\/privacy"[^>]*>Privacy page<\/a>/);
      expect(html).toMatch(/<input type="checkbox" id="review-consent"/);
      expect(html).not.toMatch(/id="review-consent"[^>]*checked/);
      expect(words.indexOf(manualConsent.label)).toBeLessThan(words.indexOf("Approve and save"));
      expect(html.match(/bg-cta/g)).toHaveLength(1);
    },
  );

  it("asks no new consent when a saved profile is edited, and doesn't say it came from a CV", () => {
    const profile = { ...personas.emma.profile, experience: [], education: [], certifications: [] };
    const html = text(
      renderToStaticMarkup(
        <ReviewStep
          draft={draftFromProfile(profile)}
          base={profile}
          source="saved"
          storage="account"
          demo={null}
          truncated={false}
          focusHeading={false}
          onSave={noop}
          onCancel={noop}
        />,
      ),
    );

    expect(html).toContain("No jobs yet.");
    expect(html).not.toContain("We didn’t find");
    expect(html).not.toContain(manualConsent.label);
    expect(html).toContain("Check your details");
  });

  it("builds a profile in two steps: upload, then check and approve", () => {
    const html = text(
      renderToStaticMarkup(<UploadStep replacing={false} demoMode={false} storage="browser" focusHeading={false} onExtracted={noop} />),
    );

    expect(html).toContain("1 Upload your CV 2 Check your details");
    expect(html).not.toContain("Add the detail");
  });

  function overview(saved: SavedProfile, storage: "account" | "browser", persistent = true) {
    return text(
      renderToStaticMarkup(
        <ProfileOverview
          saved={saved}
          storage={storage}
          persistent={persistent}
          focusHeading={false}
          onEdit={noop}
          onUploadNew={noop}
          onDelete={async () => null}
          onSavePreferences={async () => null}
        />,
      ),
    );
  }

  it.each(names)("sums up %s's saved profile, with preferences, download and delete", (name) => {
    const html = overview(fromBrowser(stored(name)), "browser");

    expect(html).toContain(personas[name].profile.fullName);
    expect(html).toContain("Check and edit your details");
    expect(html).toContain("What you’re looking for");
    expect(html).toContain(personas[name].profile.preferences.location);
    expect(html).toContain("Download my data");
    expect(html).toContain("Delete my profile");
    expect(html).toContain("Paste a job ad");
    // The personas have no volunteering, projects or languages, so their summary is as it was before #227.
    expect(html).not.toMatch(/Volunteering|Projects|Languages/);
  });

  it("counts volunteering, projects and languages in the summary when the profile has them (#227)", () => {
    const profile = {
      ...personas.emma.profile,
      volunteering: [{ role: "Volunteer digital helper", details: [] }],
      projects: [{ name: "Recipe finder", details: [] }, { name: "Accessible forms talk", details: [] }],
      languages: [{ name: "English", level: "Native" }, { name: "Spanish" }, { name: "British Sign Language" }],
    };
    const html = overview(fromBrowser({ ...stored("emma"), profile }), "browser");

    expect(html).toContain("Volunteering 1 role");
    expect(html).toContain("Projects 2 projects");
    expect(html).toContain("Languages 3 languages");
  });

  it("says a browser profile is in this browser, with the day consent was given", () => {
    const html = overview(fromBrowser(stored("sara")), "browser");

    expect(html).toContain("Saved in this browser only");
    expect(html).toContain("You agreed to us reading your CV on 20 October 2026");
  });

  it("says what a browser profile typed in by hand was agreed to", () => {
    const typedIn = { ...stored("sara"), consent: { version: manualConsent.version, givenAt: "2026-10-25T09:00:00.000Z" } };
    const html = overview(fromBrowser(typedIn), "browser");

    expect(html).toContain("You agreed to us saving the details you typed in on 25 October 2026.");
    expect(html).not.toContain("reading your CV");
  });

  it("offers a new CV only for a profile that came from one", () => {
    const typedIn = fromBrowser({ ...stored("sara"), consent: { version: manualConsent.version, givenAt: "2026-10-25T09:00:00.000Z" } });
    const inAccount = (cvFormat: "pdf" | null) =>
      fromAccount({ profile: personas.emma.profile, savedAt: "2026-10-21T10:00:00.000Z", cvFormat });

    expect(overview(fromBrowser(stored("sara")), "browser")).toContain("Upload a new CV");
    expect(overview(typedIn, "browser")).toContain("Upload your CV");
    expect(overview(typedIn, "browser")).not.toContain("Upload a new CV");
    expect([inAccount("pdf"), inAccount(null), typedIn].map(builtFromCv)).toEqual([true, false, false]);
  });

  it("asks before deleting, naming the CV file only when the account keeps one", () => {
    const inAccount = (cvFormat: "pdf" | null) =>
      fromAccount({ profile: personas.emma.profile, savedAt: "2026-10-21T10:00:00.000Z", cvFormat });

    expect(deleteQuestion(inAccount("pdf"), "account")).toBe("Delete your profile and your CV file from your account?");
    expect(deleteQuestion(inAccount(null), "account")).toBe("Delete your profile from your account?");
    expect(deleteQuestion(fromBrowser(stored("sara")), "browser")).toBe("Delete your profile from this browser?");
  });

  it("sends the account the consent just given with a new CV or a typed-in profile, and none with an edit", () => {
    const given = (version: string) => ({ version, givenAt: "2026-10-25T09:00:00.000Z" });

    expect(consentToSend("cv", given(cvConsent.version))).toBe(cvConsent.version);
    expect(consentToSend("manual", given(manualConsent.version))).toBe(manualConsent.version);
    expect(consentToSend("saved", given(cvConsent.version))).toBeUndefined();
  });

  it("says an account profile is in the account, with its CV file", () => {
    const html = overview(
      fromAccount({ profile: personas.emma.profile, savedAt: "2026-10-21T10:00:00.000Z", cvFormat: "pdf" }),
      "account",
    );

    expect(html).toContain("Saved to your CVision account, last changed on 21 October 2026.");
    expect(html).toContain("The CV file you uploaded (PDF) is kept with it.");
    expect(html).not.toContain("this browser");
  });

  it("invites the user to add preferences when there are none", () => {
    const profile = { ...personas.reza.profile, preferences: { salary: null, location: "", workModes: [], contractTypes: [], hours: [] } };

    const html = overview({ ...fromBrowser(stored("reza")), profile }, "browser");

    expect(html).toContain("Not set yet.");
    expect(html).toContain("Add what you’re looking for");
  });

  it("lists must-haves and deal-breakers on their own, even when nothing else is set", () => {
    const preferences = { salary: null, location: "", workModes: [], contractTypes: [], hours: [], notes: "No night shifts\nNot in gambling" };
    const profile = { ...personas.reza.profile, preferences };

    const html = overview({ ...fromBrowser(stored("reza")), profile }, "browser");

    expect(html).toContain("Must-haves and deal-breakers No night shifts Not in gambling");
    expect(html).toContain("Change what you’re looking for");
    expect(html).not.toContain("Not set yet.");
  });

  it("asks for must-haves and deal-breakers in the preferences form, with what is left to write", () => {
    const html = text(
      renderToStaticMarkup(
        <PreferencesForm preferences={{ ...personas.sara.profile.preferences, notes: "No night shifts" }} onSave={async () => null} onCancel={noop} />,
      ),
    );

    expect(html).toContain("Must-haves and deal-breakers (optional)");
    expect(html).toContain("Anything our options don’t cover. Write one per line");
    expect(html).toContain("No night shifts");
    expect(html).toContain("485 characters left");
  });

  it("warns when the browser will not keep the profile", () => {
    expect(overview(fromBrowser(stored("sara")), "browser", false)).toContain("This browser doesn’t keep saved data");
    expect(overview(fromBrowser(stored("sara")), "account", false)).not.toContain("This browser doesn’t keep saved data");
  });

  it("asks a signed-out visitor to sign in before building a profile, with Back to the home page", () => {
    const html = renderToStaticMarkup(<SignInToStart />);

    expect(text(html)).toContain("Sign in to build your profile");
    expect(html).toContain('href="/sign-up?next=%2Fprofile"');
    expect(html).toContain('href="/sign-in?next=%2Fprofile"');
    expect(html).toMatch(/<a href="\/"[^>]*>.*?Back<\/a>/);
  });

  it("starts from the saved account profile, without waiting for the browser", () => {
    const html = text(
      renderToStaticMarkup(
        <ProfileBuilder
          demoMode={false}
          storage={{ kind: "account", initial: { profile: personas.daniel.profile, savedAt: "2026-10-21T10:00:00.000Z", cvFormat: null } }}
        />,
      ),
    );

    expect(html).toContain("Daniel Brooks");
    expect(html).not.toContain("Loading your profile…");
  });

  it("starts at the upload when the account has no profile yet", () => {
    const html = text(renderToStaticMarkup(<ProfileBuilder demoMode={false} storage={{ kind: "account", initial: null }} />));

    expect(html).toContain("Upload your CV");
    expect(html).toContain("we save it and your CV file to your CVision account");
    expect(html).toContain("Fill in my details");
  });

  it.each([
    ["the saved profile", { profile: personas.daniel.profile, savedAt: "2026-10-21T10:00:00.000Z", cvFormat: null }],
    ["the first upload", null],
  ] as const)("puts Back first on %s, leading out of the page", (_, initial) => {
    const html = renderToStaticMarkup(<ProfileBuilder demoMode={false} storage={{ kind: "account", initial }} />);

    expect(html).toMatch(/^<div[^>]*><a href="\/dashboard"[^>]*>.*?Back<\/a>/);
  });
});

describe("BackLink", () => {
  it("is a link to the page before, with an arrow", () => {
    const html = renderToStaticMarkup(<BackLink href="/dashboard" />);

    expect(html).toMatch(/^<a href="\/dashboard"[^>]*><svg[^>]*aria-hidden="true"/);
    expect(text(html).trim()).toBe("Back");
  });

  it("is a button inside the page, for the step before", () => {
    const html = renderToStaticMarkup(<BackLink onClick={noop} />);

    expect(html).toMatch(/^<button type="button"/);
    expect(text(html).trim()).toBe("Back");
  });
});
