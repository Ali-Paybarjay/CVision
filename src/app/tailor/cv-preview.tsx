import type { CvLine, TailoredCv } from "@/features/tailor/tailored-cv";
import { CvPaper, FitLine } from "@/shared/ui";

function Line({ line, as = "p" }: { line: CvLine; as?: "p" | "li" }) {
  if (!line.tailored) {
    const Tag = as;
    return <Tag>{line.text}</Tag>;
  }
  return (
    <FitLine as={as}>
      {line.text}
      <span className="sr-only"> (tailored for this job)</span>
    </FitLine>
  );
}

/** A section of the CV: a bold Teal heading with a Teal rule under it, then its content. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h3 className="border-b-2 border-accent pb-1 text-base font-bold text-accent">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Bullets({ lines }: { lines: CvLine[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1.5 pl-5">
      {lines.map((line, index) => (
        <Line key={index} line={line} as="li" />
      ))}
    </ul>
  );
}

/**
 * The tailored CV as the download will look: one column; summary, skills, education, experience, then additional
 * information; bold Teal headings with a rule; approved lines on Fit.
 */
export function CvPreview({ cv }: { cv: TailoredCv }) {
  return (
    <CvPaper aria-label="Your tailored CV" className="text-sm leading-relaxed">
      <header className="border-b border-line pb-4">
        <h2 className="text-2xl font-bold">{cv.fullName}</h2>
        {cv.contact.length > 0 && <p className="mt-1.5 text-text-muted">{cv.contact.join(" · ")}</p>}
      </header>

      {cv.summary && (
        <Section title="Professional summary">
          <Line line={cv.summary} />
        </Section>
      )}

      {cv.skills.length > 0 && (
        <Section title="Skills">
          <Bullets lines={cv.skills} />
        </Section>
      )}

      {cv.education.length > 0 && (
        <Section title="Education">
          <Bullets lines={cv.education} />
        </Section>
      )}

      {cv.experience.length > 0 && (
        <Section title="Experience">
          <div className="flex flex-col gap-5">
            {cv.experience.map((job, index) => (
              <div key={index}>
                <p className="font-bold">
                  {job.title}, {job.company}
                </p>
                {job.dates && <p className="text-text-muted">{job.dates}</p>}
                <div className="mt-2">
                  <Bullets lines={job.lines} />
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {cv.certifications.length > 0 && (
        <Section title="Additional information">
          <Bullets lines={cv.certifications} />
        </Section>
      )}
    </CvPaper>
  );
}
