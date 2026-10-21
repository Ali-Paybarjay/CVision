import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { personas, type PersonaName } from "@/shared/sample-data";
import { cvConsent } from "../consent";
import { extractionFromProfile } from "../cv-extraction";
import { draftFromExtraction } from "../review-draft";
import { suggestFollowUpQuestions } from "../follow-up";
import type { StoredProfile } from "../profile-store";
import { ProfileBuilder } from "./profile-builder";
import { ProfileOverview } from "./profile-overview";
import { QuestionsStep } from "./questions-step";
import { ReviewStep } from "./review-step";
import { SignInNotice, UploadStep } from "./upload-step";

// Render checks for each screen of the profile flow: they catch crashes and missing content.
// Clicking through the flow is covered by the reducer tests and by trying it in a browser.

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("../actions", () => ({ suggestFollowUpQuestionsAction: vi.fn() }));

const noop = () => {};
const names = Object.keys(personas) as PersonaName[];
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

function stored(name: PersonaName): StoredProfile {
  return {
    version: 1,
    profile: personas[name].profile,
    consent: { version: cvConsent.version, givenAt: "2026-10-20T18:00:00.000Z" },
    questions: suggestFollowUpQuestions(personas[name].profile),
    savedAt: "2026-10-20T18:05:00.000Z",
  };
}

describe("profile screens", () => {
  it("shows a loading state until the browser has read the saved profile", () => {
    expect(text(renderToStaticMarkup(<ProfileBuilder demoMode={false} />))).toContain("Loading your profile…");
  });

  it("asks for consent next to the upload, unticked", () => {
    const html = renderToStaticMarkup(<UploadStep replacing={false} demoMode={false} focusHeading={false} onExtracted={noop} />);

    expect(text(html)).toContain(cvConsent.label);
    for (const point of cvConsent.points) expect(text(html)).toContain(point);
    expect(html).toMatch(new RegExp(`<input type="checkbox"[^>]*name="consent" value="${cvConsent.version}"`));
    expect(html).not.toMatch(/name="consent"[^>]*checked/);
    expect(html).toContain('accept=".pdf,.docx');
    expect(text(html)).not.toContain("Demo mode");
  });

  it("warns before an upload in demo mode that the CV won’t become the profile", () => {
    const html = text(renderToStaticMarkup(<UploadStep replacing={false} demoMode focusHeading={false} onExtracted={noop} />));
    expect(html).toContain("Demo mode: your CV won’t become your profile yet");
    expect(html).toContain("sample-data/cvs");
  });

  it("points a signed-out visitor to sign in or create an account", () => {
    const html = renderToStaticMarkup(<SignInNotice />);

    expect(text(html)).toContain("Sign in to upload your CV");
    expect(html).toContain('href="/sign-in"');
    expect(html).toContain('href="/sign-up"');
  });

  it.each(names)("lists every item of %s's CV for review, none approved yet", (name) => {
    const profile = personas[name].profile;
    const html = text(
      renderToStaticMarkup(
        <ReviewStep
          draft={draftFromExtraction(extractionFromProfile(profile))}
          base={profile}
          isNew
          demo={{ persona: profile.fullName, text: "Text read from the uploaded file" }}
          truncated={false}
          focusHeading={false}
          onSave={noop}
          onCancel={noop}
        />,
      ),
    );

    expect(html).toContain("Check your details");
    expect(html).toContain(`Demo mode: this is ${profile.fullName}’s sample profile, not your CV`);
    expect(html).toContain("Text read from the uploaded file");
    for (const job of profile.experience) expect(html).toContain(`${job.title} at ${job.company}`);
    const total = 3 + profile.experience.length + profile.education.length + profile.certifications.length;
    expect(html).toContain(`0 of ${total} items approved`);
    expect(html.match(/Approve /g)?.length).toBe(total);
  });

  it("says when a month is our guess, and leaves missing details empty for the user to fill", () => {
    const extraction = extractionFromProfile(personas.daniel.profile);
    extraction.experience[0] = { ...extraction.experience[0], startDate: "2019", company: "" };
    const html = text(
      renderToStaticMarkup(
        <ReviewStep
          draft={draftFromExtraction(extraction)}
          base={personas.daniel.profile}
          isNew
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

  it.each(names)("shows %s's follow-up questions with a place to answer each", (name) => {
    const questions = suggestFollowUpQuestions(personas[name].profile);
    const html = text(
      renderToStaticMarkup(
        <QuestionsStep
          questions={questions}
          answers={[]}
          state={{ status: "ready", demo: true }}
          showSteps
          focusHeading={false}
          onAnswer={noop}
          onRetry={noop}
          onFinish={noop}
        />,
      ),
    );

    for (const question of questions) expect(html).toContain(question.question);
    expect(html.match(/Save answer/g)?.length).toBe(questions.length);
    expect(html).toContain(`0 of ${questions.length} answered`);
  });

  it("explains a failure to write questions and offers to try again", () => {
    const html = text(
      renderToStaticMarkup(
        <QuestionsStep
          questions={[]}
          answers={[]}
          state={{ status: "error", message: "CVision is busy right now. Try again in a minute." }}
          showSteps={false}
          focusHeading={false}
          onAnswer={noop}
          onRetry={noop}
          onFinish={noop}
        />,
      ),
    );
    expect(html).toContain("CVision is busy right now.");
    expect(html).toContain("Try again");
  });

  it.each(names)("sums up %s's saved profile, with download and delete", (name) => {
    const html = text(
      renderToStaticMarkup(
        <ProfileOverview
          stored={stored(name)}
          persistent
          focusHeading={false}
          onEdit={noop}
          onQuestions={noop}
          onUploadNew={noop}
          onDelete={noop}
        />,
      ),
    );

    expect(html).toContain(personas[name].profile.fullName);
    expect(html).toContain("Download my data");
    expect(html).toContain("Delete my profile");
    expect(html).toContain("Paste a job ad");
  });

  it("warns when the browser will not keep the profile", () => {
    const html = text(
      renderToStaticMarkup(
        <ProfileOverview
          stored={stored("sara")}
          persistent={false}
          focusHeading={false}
          onEdit={noop}
          onQuestions={noop}
          onUploadNew={noop}
          onDelete={noop}
        />,
      ),
    );
    expect(html).toContain("This browser doesn’t keep saved data");
  });
});
