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

function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-6 border-b border-line pb-1 text-base font-semibold">{children}</h3>;
}

/** The tailored CV as the download will look: one column, plain headings, approved lines on Fit. */
export function CvPreview({ cv }: { cv: TailoredCv }) {
  return (
    <CvPaper aria-label="Your tailored CV" className="text-sm leading-relaxed">
      <h2 className="text-2xl font-bold">{cv.fullName}</h2>
      {cv.contact.length > 0 && <p className="mt-1 text-text-muted">{cv.contact.join(" · ")}</p>}

      {cv.summary && (
        <>
          <Heading>Professional summary</Heading>
          <div className="mt-2">
            <Line line={cv.summary} />
          </div>
        </>
      )}

      {cv.skills.length > 0 && (
        <>
          <Heading>Skills</Heading>
          <ul className="mt-2 flex flex-col gap-1">
            {cv.skills.map((line, index) => (
              <Line key={index} line={line} as="li" />
            ))}
          </ul>
        </>
      )}

      {cv.experience.length > 0 && (
        <>
          <Heading>Experience</Heading>
          {cv.experience.map((job, index) => (
            <div key={index} className="mt-3">
              <p className="font-semibold">
                {job.title}, {job.company}
              </p>
              {job.dates && <p className="text-text-muted">{job.dates}</p>}
              <ul className="mt-1 flex list-disc flex-col gap-1 pl-5">
                {job.lines.map((line, lineIndex) => (
                  <Line key={lineIndex} line={line} as="li" />
                ))}
              </ul>
            </div>
          ))}
        </>
      )}

      {cv.education.length > 0 && (
        <>
          <Heading>Education</Heading>
          <ul className="mt-2 flex flex-col gap-1">
            {cv.education.map((line, index) => (
              <Line key={index} line={line} as="li" />
            ))}
          </ul>
        </>
      )}

      {cv.certifications.length > 0 && (
        <>
          <Heading>Additional information</Heading>
          <ul className="mt-2 flex flex-col gap-1">
            {cv.certifications.map((line, index) => (
              <Line key={index} line={line} as="li" />
            ))}
          </ul>
        </>
      )}
    </CvPaper>
  );
}
