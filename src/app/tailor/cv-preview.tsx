import { cvHeadings, type CvLine, type TailoredCv } from "@/features/tailor/tailored-cv";
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
  return <h3 className="mt-6 text-base font-bold text-accent">{children}</h3>;
}

/** The tailored CV in the layout of the template, as the download will look, with approved lines on Fit. */
export function CvPreview({ cv }: { cv: TailoredCv }) {
  return (
    <CvPaper aria-label="Your tailored CV" className="text-sm leading-relaxed">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-line pb-2">
        <h2 className="text-2xl font-bold">{cv.fullName}</h2>
        {cv.contact.length > 0 && <p className="text-xs">{cv.contact.join(" | ")}</p>}
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

      {cv.experience.length > 0 && (
        <>
          <Heading>{cvHeadings.experience}</Heading>
          {cv.experience.map((job, index) => (
            <div key={index} className="mt-2">
              <p className="uppercase">{job.company}</p>
              {job.dates && <p>{job.dates}</p>}
              <p className="font-semibold">{job.title}</p>
              <ul className="mt-1 flex list-disc flex-col gap-1 pl-5">
                {job.lines.map((line, lineIndex) => (
                  <Line key={lineIndex} line={line} as="li" />
                ))}
              </ul>
            </div>
          ))}
        </>
      )}

      {cv.certifications.length + cv.technicalSkills.length > 0 && (
        <>
          <Heading>{cvHeadings.other}</Heading>
          {cv.certifications.length > 0 && (
            <>
              <p className="mt-1 italic">{cvHeadings.certificates}</p>
              <ul className="flex list-disc flex-col gap-1 pl-5">
                {cv.certifications.map((line, index) => (
                  <Line key={index} line={line} as="li" />
                ))}
              </ul>
            </>
          )}
          {cv.technicalSkills.length > 0 && (
            <p className="mt-1">
              <strong>{cvHeadings.technical}</strong> {cv.technicalSkills.map((line) => line.text).join(", ")}
            </p>
          )}
        </>
      )}
    </CvPaper>
  );
}
