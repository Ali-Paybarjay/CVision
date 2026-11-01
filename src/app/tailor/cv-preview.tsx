import { cvHeadings, otherLines, type CvLine, type TailoredCv } from "@/features/tailor/tailored-cv";
import { CvPaper, FitLine } from "@/shared/ui";

function Line({ line, as = "p" }: { line: CvLine; as?: "p" | "li" }) {
  const content = (
    <>
      {line.label && <strong>{line.label} </strong>}
      {line.text}
    </>
  );
  if (!line.tailored) {
    const Tag = as;
    return <Tag>{content}</Tag>;
  }
  return (
    <FitLine as={as}>
      {content}
      <span className="sr-only"> (tailored for this job)</span>
    </FitLine>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-6 border-b border-cv-ink/20 pb-1 text-xs font-bold tracking-wider text-accent">{children}</h3>;
}

/** The tailored CV in the layout of the template, as the download will look, with approved lines on Fit. */
export function CvPreview({ cv }: { cv: TailoredCv }) {
  const other = otherLines(cv);
  return (
    <CvPaper aria-label="Your tailored CV" className="text-sm leading-relaxed">
      <div>
        <h2 className="text-2xl font-bold">{cv.fullName}</h2>
        {cv.headline && <p className="font-semibold text-cv-ink/70">{cv.headline}</p>}
        {cv.contact.map((line) => (
          <p key={line} className="text-xs text-cv-ink/70">
            {line}
          </p>
        ))}
      </div>

      {cv.summary && (
        <>
          <Heading>{cvHeadings.summary}</Heading>
          <div className="mt-1">
            <Line line={cv.summary} />
          </div>
        </>
      )}

      {cv.skills.length > 0 && (
        <>
          <Heading>{cvHeadings.skills}</Heading>
          <ul className="mt-1 grid list-disc grid-flow-col gap-x-6 gap-y-1 pl-5 font-semibold" style={{ gridTemplateRows: `repeat(${Math.ceil(cv.skills.length / 2)}, auto)` }}>
            {cv.skills.map((line, index) => (
              <Line key={index} line={line} as="li" />
            ))}
          </ul>
        </>
      )}

      {cv.experience.length > 0 && (
        <>
          <Heading>{cvHeadings.experience}</Heading>
          {cv.experience.map((job, index) => (
            <div key={index} className="mt-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                <p className="font-semibold">{job.title}</p>
                {job.dates && <p className="text-xs text-cv-ink/70">{job.dates}</p>}
              </div>
              <p className="text-cv-ink/70">{job.company}</p>
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
          <Heading>{cvHeadings.education}</Heading>
          <div className="mt-1 flex flex-col gap-1">
            {cv.education.map((line, index) => (
              <Line key={index} line={line} />
            ))}
          </div>
        </>
      )}

      {other.length > 0 && (
        <>
          <Heading>{cvHeadings.other}</Heading>
          <div className="mt-1 flex flex-col gap-1">
            {other.map((line, index) => (
              <Line key={index} line={line} />
            ))}
          </div>
        </>
      )}
    </CvPaper>
  );
}
