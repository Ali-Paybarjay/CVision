import type { Metadata } from "next";
import { personas } from "@/shared/sample-data";
import {
  BrandMark,
  Button,
  Card,
  CvPaper,
  Field,
  FitLine,
  Input,
  MatchMarker,
  Notice,
  Page,
  PathSteps,
  type Requirement,
  RequirementList,
  SectionLabel,
  StatusChip,
  Textarea,
  WaitNote,
  Wordmark,
} from "@/shared/ui";

export const metadata: Metadata = { title: "UI kit" };

const sara = personas.sara.profile;
const internship = sara.experience[0];
const saraJob = personas.sara.jobs[0];
const saraMatch = personas.sara.match;

/**
 * Plan A's job ad beside the CV, from Sara's sample match: a requirement her CV shows is Matched; one it shows but
 * vaguely is Tailored, numbered like the CV line her answer rewrote; anything with no evidence is Not on your CV, and
 * stays that way, because nothing is invented.
 */
let nextLine = 1;
const requirementFor = (text: string): Requirement => {
  if (saraMatch.strengths.some((item) => item.requirement === text)) return { text, status: "matched", note: "Matched in your CV" };
  if (saraMatch.gaps.some((gap) => gap.requirement === text && gap.kind === "unclear")) {
    return { text, status: "tailored", line: nextLine++, note: "Tailored from your answer" };
  }
  return { text, status: "missing", note: "Not on your CV. We won’t add it." };
};
const saraRequirements = [
  { title: "Essential", items: saraJob.requirements.essential.map(requirementFor) },
  { title: "Desirable", items: saraJob.requirements.desirable.map(requirementFor) },
];

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
          <Button disabled>Disabled while it works</Button>
        </div>
        <p className="mt-3 text-sm text-text-muted">On a computer the pointer turns into a hand over every button, but not over a disabled one.</p>
      </Card>

      <Card>
        <h2 className="text-xl">Logo</h2>
        <p className="mt-1 text-sm text-text-muted">
          The Tick V icon beside the wordmark. Use the icon alone only where the name does not fit, such as a browser tab.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-6">
          <p className="flex items-center gap-2 text-xl">
            <BrandMark className="size-7" />
            <Wordmark />
          </p>
          <BrandMark className="size-16" />
          <BrandMark className="size-8" />
          <BrandMark className="size-4" />
        </div>
      </Card>

      <section className="rounded-lg bg-emphasis p-5 sm:p-6">
        <h2 className="text-xl text-on-emphasis">Emphasis section</h2>
        <p className="mt-1 text-sm text-on-emphasis">Ink with white text in light mode, Raised with Chalk in dark mode.</p>
        <p className="mt-4 flex items-center gap-2 text-2xl">
          <BrandMark tone="on-emphasis" className="size-8" />
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

      <Card>
        <h2 className="text-xl">Waiting for a slow request</h2>
        <p className="mt-1 text-sm text-text-muted">
          Under the button while a request runs: say what is happening and how long it can take. Pass nothing when it
          is done; the empty live region stays, so a screen reader reads the sentence when it appears.
        </p>
        <div className="mt-4">
          <Button disabled>Checking your CV…</Button>
          <WaitNote className="mt-3">Checking your CV. This can take up to a minute. Keep this page open.</WaitNote>
        </div>
      </Card>

      <Card>
        <h2 className="text-xl">Where the user is on the main path</h2>
        <p className="mt-1 text-sm text-text-muted">
          At the top of Profile, Jobs and Tailor (#238): the three pages in order, the current one in bold, and the next
          one after it. A step before the current one is an underlined link back to its page.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <PathSteps current={1} />
          <PathSteps current={2} />
          <PathSteps current={3} />
        </div>
      </Card>

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

      <section aria-labelledby="plan-a-title" className="flex flex-col gap-6">
        <div>
          <h2 id="plan-a-title" className="text-xl">
            Plan A pieces
          </h2>
          <p className="mt-1 max-w-[65ch] text-sm text-text-muted">
            From docs/design/paper-desk. A number joins a tailored CV line to the requirement that asked for it, and every status has an icon and a
            word.
          </p>
        </div>
        <Card className="flex flex-col gap-4">
          <SectionLabel size="large">Section label, large</SectionLabel>
          <SectionLabel>Section label, the job ad</SectionLabel>
          <div className="flex flex-wrap items-center gap-3">
            <MatchMarker line={1} />
            <MatchMarker line={12} />
            <StatusChip status="matched" />
            <StatusChip status="tailored" line={1} />
            <StatusChip status="tailored" />
            <StatusChip status="missing" />
          </div>
        </Card>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          <Card>
            <SectionLabel as="h3">The job ad</SectionLabel>
            <p className="mt-1 font-semibold">
              {saraJob.title}, {saraJob.company}
            </p>
            <RequirementList groups={saraRequirements} headingLevel="h4" className="mt-4" />
          </Card>
          <CvPaper shadow className="text-sm">
            <p className="text-xl font-bold">{sara.fullName}</p>
            <SectionLabel as="h3" className="mt-5 border-b border-line pb-1 text-cv-ink">
              Experience
            </SectionLabel>
            <ul className="mt-3 flex flex-col gap-1.5">
              <li>{internship.duties[0]}</li>
              <FitLine as="li" className="flex items-start gap-2">
                <MatchMarker line={1} className="mt-0.5" />
                <span>Presented the dashboards to regional managers every Monday, with a one-page summary in plain English</span>
              </FitLine>
            </ul>
          </CvPaper>
        </div>
        <Card>
          <SectionLabel as="h3">Compact, for small cards</SectionLabel>
          <RequirementList groups={saraRequirements.slice(0, 1)} size="compact" headingLevel="h4" className="mt-3" />
        </Card>
      </section>

      <Card>
        <h2 className="text-xl">Tailored line outside the CV</h2>
        <FitLine className="mt-4">In panels, a tailored line switches to Fit Night with a Lagoon bar in dark mode.</FitLine>
      </Card>
    </Page>
  );
}
