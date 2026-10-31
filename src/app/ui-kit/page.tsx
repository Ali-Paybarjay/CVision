import type { Metadata } from "next";
import { personas } from "@/shared/sample-data";
import { Button, Card, CvPaper, Field, FitLine, Input, Notice, Page, Textarea, Wordmark } from "@/shared/ui";

export const metadata: Metadata = { title: "UI kit" };

const sara = personas.sara.profile;
const internship = sara.experience[0];

/** Every shared component in one place. Switch the device to dark mode to check both palettes. */
export default function UiKitPage() {
  return (
    <Page
      width="wide"
      title="UI kit"
      description="The shared components from src/shared/ui. Use these instead of styling your own, so every page follows the brand in light and dark mode."
    >
      <Card>
        <h2 className="text-xl">Buttons</h2>
        <p className="mt-1 text-sm text-text-muted">Coral is for the one main action on a screen. Everything else is secondary or quiet.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="primary">Tailor my CV</Button>
          <Button>Upload a different CV</Button>
          <Button variant="quiet">Skip this question</Button>
          <Button size="compact">Compact, for the top menu</Button>
        </div>
      </Card>

      <section className="rounded-lg bg-emphasis p-5 sm:p-6">
        <h2 className="text-xl text-on-emphasis">Emphasis section</h2>
        <p className="mt-1 text-sm text-on-emphasis">Ink with white text in light mode, Raised with Chalk in dark mode.</p>
        <p className="mt-4 text-2xl">
          <Wordmark tone="on-emphasis" />
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-xl">Form fields</h2>
          <form className="mt-4 flex flex-col gap-5">
            <Field label="Job title" hint="As it appears in the ad.">
              {(props) => <Input {...props} defaultValue="Junior Data Analyst" />}
            </Field>
            <Field label="Job ad" error="Paste the full job ad, including the requirements.">
              {(props) => <Textarea {...props} placeholder="Paste the job ad here" />}
            </Field>
          </form>
        </Card>

        <Card>
          <h2 className="text-xl">Status messages</h2>
          <p className="mt-1 text-sm text-text-muted">Always an icon and words, never colour alone.</p>
          <div className="mt-4 flex flex-col gap-3">
            <Notice tone="success" title="Your CV is tailored">3 changes approved for Pennine Health Analytics.</Notice>
            <Notice tone="warning" title="Power BI is not on your CV">The ad lists it as desirable. Tell us if you have used it.</Notice>
            <Notice tone="error" title="We could not read this file">Upload a PDF or Word document under 5 MB.</Notice>
            <Notice tone="info">Nothing is sent to an employer. You apply yourself.</Notice>
          </div>
        </Card>
      </div>

      <section>
        <h2 className="text-xl">CV preview</h2>
        <p className="mt-1 text-sm text-text-muted">
          Always Paper with Ink text, even in dark mode, because it shows the file people download. Tailored lines carry the Fit highlight.
        </p>
        <CvPaper className="mt-4">
          <h3 className="text-2xl font-bold">{sara.fullName}</h3>
          <p className="flex flex-wrap gap-x-4 text-sm">
            <span>{sara.contact.location}</span>
            <span>{sara.contact.email}</span>
            <span>{sara.contact.phone}</span>
          </p>
          <p className="mt-4">{sara.summary}</p>
          <h4 className="mt-6 border-b border-line pb-1 text-sm font-semibold">Experience</h4>
          <p className="mt-3 font-semibold">
            {internship.title}, {internship.company}
          </p>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm">
            <li>{internship.duties[0]}</li>
            <FitLine as="li">
              Presented the dashboards to regional managers every Monday, with a one-page summary in plain English
            </FitLine>
            <li>{internship.achievements[0]}</li>
          </ul>
        </CvPaper>
      </section>

      <Card>
        <h2 className="text-xl">Tailored line outside the CV</h2>
        <FitLine className="mt-4">In panels, a tailored line switches to Fit Night with a Lagoon bar in dark mode.</FitLine>
      </Card>
    </Page>
  );
}
