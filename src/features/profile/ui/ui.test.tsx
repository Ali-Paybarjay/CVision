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
import { deleteNote, deleteQuestion, ProfileOverview } from "./profile-overview";
import { dutiesHint, ReviewStep } from "./review-step";
import { SignInToStart } from "./sign-in-to-start";
import { SignInNotice, UploadStep } from "./upload-step";

// Render checks for each screen of the profile flow: they catch crashes and missing content.
// Clicking through the flow is covered by the reducer tests and by trying it in a browser.

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
    target,
    rel,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    target?: string;
    rel?: string;
  }) => (
    <a href={href} className={className} target={target} rel={rel}>
      {children}
    </a>
  ),
}));

vi.mock("../actions", () => ({ deleteMyProfileAction: vi.fn() }));

const noop = () => {};
const names = Object.keys(personas) as PersonaName[];
// The Privacy link opens in a new tab, and says so on the page (issue #235). privacyLink checks that; text drops the words,
// so a consent point compares as the sentence it is.
const privacyLink = /<a href="\/privacy" class="[^"]*" target="_blank" rel="noopener noreferrer">Privacy page<span class="font-normal"> \(opens in a new tab\)<\/span><\/a>/;
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/ \(opens in a new tab\)/g, "")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

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
    expect(html).toMatch(privacyLink);
    expect(html).toMatch(new RegExp(`<input type="checkbox"[^>]*name="consent" value="${cvConsent.version}"`));
    expect(html).not.toMatch(/name="consent"[^>]*checked/);
    expect(html).toContain('accept=".pdf,.docx');
    expect(text(html)).not.toContain("Demo mode");
  });

  it("keeps an empty live region under the button, where the wait shows on screen (issue #235)", () => {
    const html = renderToStaticMarkup(
      <UploadStep replacing={false} demoMode={false} storage="account" focusHeading={false} onExtracted={noop} />,
    );

    expect(html).toMatch(/<\/button><\/div><div aria-live="polite"><\/div><\/div><\/form>/);
    expect(html).not.toContain('class="sr-only"');
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
    // The card with the details stays after the upload, as the second choice.
    expect(words.lastIndexOf("No CV to upload?")).toBeGreaterThan(words.indexOf("Read my CV"));
    // Read my CV stays the page's one main button.
    expect(html.match(/bg-cta/g)).toHaveLength(1);
  });

  // #204: on a phone the card is a long scroll away, so the way in for someone without a CV is under the heading too.
  it("shows someone with no CV their way in right under the heading", () => {
    const html = renderToStaticMarkup(
      <UploadStep replacing={false} demoMode={false} storage="account" focusHeading={false} onExtracted={noop} onStartManual={noop} />,
    );
    const words = text(html);
    const heading = words.indexOf("Upload your CV");
    const shortcut = words.indexOf("No CV to upload? Fill in my details");

    expect(shortcut).toBeGreaterThan(heading);
    expect(shortcut).toBeLessThan(words.indexOf("Your CV"));
    // Two ways in, one action: both are "Fill in my details", and neither is Coral.
    expect(html.match(/>Fill in my details<\/button>/g)).toHaveLength(2);
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

  it("points at a line that looks mistyped under its box, without stopping approval", () => {
    const sara = personas.sara.profile;
    const job = sara.experience[0];
    const typo = "Cut preparation\\xsaxasxsax ژشسزشسزشسز time from 4 hours to 30 minutes";
    const profile = { ...sara, experience: [{ ...job, achievements: [...job.achievements, typo] }, ...sara.experience.slice(1)] };
    const render = (draft: ReviewDraft) =>
      renderToStaticMarkup(
        <ReviewStep
          draft={draft}
          base={profile}
          source="saved"
          storage="account"
          demo={null}
          truncated={false}
          focusHeading={false}
          onSave={noop}
          onCancel={noop}
        />,
      );

    const html = render(draftFromProfile(profile));
    const words = text(html);

    expect(words.match(/This line looks mistyped/g)).toHaveLength(1);
    expect(words).toContain(typo);
    expect(words).toContain("Check it before you approve. If it’s right as it is, leave it.");
    // Screen readers hear it with the box, and the box isn't marked as an error.
    const noteId = /<div id="([^"]+)"><div role="status"/.exec(html)?.[1];
    expect(html).toMatch(new RegExp(`<textarea[^>]*aria-describedby="[^"]*${noteId}"`));
    expect(html).not.toMatch(new RegExp(`<textarea[^>]*aria-describedby="[^"]*${noteId}"[^>]*aria-invalid`));
    expect(text(render(draftFromProfile(sara)))).not.toContain("looks mistyped");
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

  // #236: a pilot user saw "What you did" empty for two older jobs and thought we had dropped their lines.
  it("says why “What you did” is empty for a job read from the CV, and only for that job", () => {
    const daniel = personas.daniel.profile;
    const [first, second] = daniel.experience;
    const profile = {
      ...daniel,
      experience: [
        first,
        { ...second, duties: [], achievements: [] },
        { ...second, title: "Stock assistant", duties: [], achievements: ["Cut stock loss from 2.1% to 1.3%"] },
      ],
    };
    const fromCv = reviewReducer(draftFromExtraction(extractionFromProfile(profile)), {
      type: "add",
      section: "experience",
      key: "new-experience-page-1",
    });
    const words = text(
      renderToStaticMarkup(
        <ReviewStep
          draft={fromCv}
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
    const hints = words.match(/What you did (Your CV has no lines|Your CV lists only results|One per line, as on your CV)/g);

    // The job with lines, the job with none, the job with only results, then the job the user added.
    expect(hints).toEqual([
      "What you did One per line, as on your CV",
      "What you did Your CV has no lines",
      "What you did Your CV lists only results",
      "What you did One per line, as on your CV",
    ]);
    expect(words).toContain("Your CV has no lines for this job. Add what you did if you want us to use it.");
    expect(words).toContain(
      "Your CV lists only results for this job, so they’re under Results and achievements. Add what you did if you want us to use it.",
    );
  });

  it("gives the usual hint back as soon as the user writes what they did", () => {
    const empty = { duties: "", achievements: "" };
    const onlyResults = { ...empty, achievements: "Cut stock loss" };

    expect(dutiesHint(empty, true, empty)).toMatch(/^Your CV has no lines/);
    expect(dutiesHint(onlyResults, true, onlyResults)).toMatch(/^Your CV lists only results/);
    expect(dutiesHint({ ...empty, duties: "R" }, true, empty)).toBe("One per line, as on your CV.");
    expect(dutiesHint({ ...empty, duties: "  \n " }, true, empty)).toMatch(/^Your CV has no lines/);
    // A job added by hand, and a profile typed in or edited later, keep their usual hints.
    expect(dutiesHint(empty, true, null)).toBe("One per line, as on your CV.");
    expect(dutiesHint(empty, false, null)).toBe("One per line.");
  });

  // #310: the hint says what the CV had, not what the boxes hold now.
  it("speaks of what the CV had, whatever the user has deleted or typed since", () => {
    const empty = { duties: "", achievements: "" };
    const read = { duties: "Ran the tills", achievements: "Cut stock loss" };

    // The CV had lines for this job, so clearing both boxes doesn't make the CV "have no lines".
    expect(dutiesHint(empty, true, read)).toBe("One per line, as on your CV.");
    // The CV had nothing for this job: a result the user types in doesn't make the CV "list only results".
    expect(dutiesHint({ ...empty, achievements: "Won an award" }, true, empty)).toMatch(/^Your CV has no lines/);
    // The CV had only results: clearing them still says so, as that is what the CV had.
    expect(dutiesHint(empty, true, { ...empty, achievements: "Cut stock loss" })).toMatch(/^Your CV lists only results/);
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
    // Volunteering has its own section now, so the Work history hint no longer sends it there (#253 review).
    expect(words).toContain("No jobs yet. Part-time work and placements count too.");
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
      expect(html).toMatch(privacyLink);
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

  // A pilot on this step asked what to do next (#334).
  it("says what comes after approving and links to Approve, but not when a saved profile is edited", () => {
    const profile = personas.emma.profile;
    const review = (source: "cv" | "saved") =>
      renderToStaticMarkup(
        <ReviewStep
          draft={draftFromProfile(profile)}
          base={profile}
          source={source}
          storage="account"
          demo={null}
          truncated={false}
          focusHeading={false}
          onSave={noop}
          onCancel={noop}
        />,
      );

    const fromCv = review("cv");
    expect(text(fromCv)).toContain("Once your profile is approved, you’ll paste a job ad and tailor your CV to it.");
    expect(fromCv).toContain('href="#approve-heading"');
    expect(fromCv).toContain('id="approve-heading"');
    expect(review("saved")).not.toContain("Go to Approve");
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
    expect(html).toContain("Download my profile");
    expect(html).toContain("Delete my profile");
    // A browser profile has no account, so no way to Your data.
    expect(html).not.toContain("delete your account");
    expect(html).toContain("Paste a job ad");
    // The personas have no volunteering, projects or languages, so their summary is as it was before #227.
    expect(html).not.toMatch(/Volunteering|Projects|Languages/);
  });

  // A pilot who had just approved their profile asked what to do now (#334): the next step is on screen first.
  it("puts the next step first on the saved profile, as its one Coral button, then the profile and both ways to change it", () => {
    const html = renderToStaticMarkup(
      <ProfileOverview
        saved={fromBrowser(stored("sara"))}
        storage="browser"
        persistent
        focusHeading={false}
        onEdit={noop}
        onUploadNew={noop}
        onDelete={async () => null}
        onSavePreferences={async () => null}
      />,
    );
    const words = text(html);

    expect(words.indexOf("Next: find a job to apply for")).toBeLessThan(words.indexOf("Sara Khan"));
    expect(html.match(/bg-cta/g)).toHaveLength(1);
    expect(html).toMatch(/<a href="\/jobs" class="[^"]*bg-cta[^"]*">Paste a job ad<\/a>/);
    expect(html).toContain('id="next-step-heading"');
    // Editing and a new CV sit together in the profile's own card, before the preferences and the data card.
    expect(words.indexOf("Check and edit your details")).toBeLessThan(words.indexOf("Upload a new CV"));
    expect(words.indexOf("Upload a new CV")).toBeLessThan(words.indexOf("What you’re looking for"));
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

  // The button used to say Delete everything, but the account and the rest of its records stay.
  it("says what stays when the profile is deleted from an account", () => {
    expect(deleteNote("account")).toBe(
      "Your account, saved job ads, tailored CVs and applications stay. This can’t be undone, so download your profile first if you want a copy.",
    );
    expect(deleteNote("browser")).toBe("This can’t be undone, so download your profile first if you want a copy.");
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
    expect(html).toContain("To download everything in your account, or to delete your account, go to Your data");
  });

  it("invites the user to add preferences when there are none", () => {
    const profile = {
      ...personas.reza.profile,
      contact: { ...personas.reza.profile.contact, location: undefined },
      preferences: { salary: null, location: "", workModes: [], contractTypes: [], hours: [] },
    };

    const html = overview({ ...fromBrowser(stored("reza")), profile }, "browser");

    expect(html).toContain("Not set yet.");
    expect(html).toContain("Add what you’re looking for");
  });

  // A pilot in London looking in Manchester: the place to work is its own, and the town or city only fills an empty one.
  it("shows the town or city as the place to work only when none is set, and says so", () => {
    const withPlace = (location: string) => ({
      ...personas.reza.profile,
      contact: { ...personas.reza.profile.contact, location: "London" },
      preferences: { salary: null, location, workModes: [], contractTypes: [], hours: [] },
    });
    const html = (location: string) => overview({ ...fromBrowser(stored("reza")), profile: withPlace(location) }, "browser");

    expect(html("")).toContain("London (your town or city)");
    expect(html("Manchester")).toContain("Manchester");
    expect(html("Manchester")).not.toContain("London");
  });

  it("says in the preferences form that an empty place means the town or city", () => {
    const form = (townOrCity?: string) =>
      text(
        renderToStaticMarkup(
          <PreferencesForm preferences={personas.sara.profile.preferences} townOrCity={townOrCity} onSave={async () => null} onCancel={noop} />,
        ),
      );

    expect(form("London")).toContain("A town, city or postcode. Leave it empty to use your town or city, London.");
    expect(form()).not.toContain("Leave it empty");
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

  it("asks a signed-out visitor to sign in before building a profile, with no Back above the card", () => {
    const html = renderToStaticMarkup(<SignInToStart />);

    expect(text(html)).toContain("Sign in to build your profile");
    expect(html).toContain('href="/sign-up?next=%2Fprofile"');
    expect(html).toContain('href="/sign-in?next=%2Fprofile"');
    expect(html).not.toContain(">Back<");
    // The Coral button says what it does, and "free" is in the small line under it (docs/brand.md, Calls to action).
    expect(html).toMatch(/bg-cta[^"]*">Create your account<\/a>/);
    expect(text(html)).toContain("Free account. Start with your CV or your details.");
    expect(text(html)).not.toContain("Create a free account");
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
  ] as const)("has no Back out of the page on %s: the steps bar and the menu lead out", (_, initial) => {
    const html = renderToStaticMarkup(<ProfileBuilder demoMode={false} storage={{ kind: "account", initial }} />);

    expect(html).not.toContain(">Back<");
  });
});

describe("BackLink", () => {
  it("is a link to the page before, with an arrow", () => {
    const html = renderToStaticMarkup(<BackLink href="/dashboard" />);

    expect(html).toMatch(/^<a href="\/dashboard"[^>]*><svg[^>]*aria-hidden="true"/);
    expect(text(html).trim()).toBe("Back");
  });
});
