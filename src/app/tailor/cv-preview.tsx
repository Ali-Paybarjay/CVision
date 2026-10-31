import { cvHeadings, type CvEntry, type CvLine, type TailoredCv } from "@/features/tailor/tailored-cv";
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
  return <h3 className="mt-6 text-base font-bold">{children}</h3>;
}

function Entries({ heading, items }: { heading: string; items: CvEntry[] }) {
  if (items.length === 0) return null;
  return (
    <>
      <Heading>{heading}</Heading>
      {items.map((item, index) => (
        <div key={index} className="mt-2">
          {item.company && <p className="uppercase">{item.company}</p>}
          {item.dates && <p>{item.dates}</p>}
          <p className="font-semibold">{item.title}</p>
          {item.lines.length > 0 && (
            <ul className="mt-1 flex list-disc flex-col gap-1 pl-5">
              {item.lines.map((line, lineIndex) => (
                <Line key={lineIndex} line={line} as="li" />
              ))}
            </ul>
          )}
        </div>
      ))}
    </>
  );
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

      <Entries heading={cvHeadings.experience} items={cv.experience} />
      <Entries heading={cvHeadings.projects} items={cv.projects} />
      <Entries heading={cvHeadings.volunteering} items={cv.volunteering} />

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

      {cv.languages.length > 0 && (
        <>
          <Heading>{cvHeadings.languages}</Heading>
          <ul className="mt-1 flex list-disc flex-col gap-1 pl-5">
            {cv.languages.map((line, index) => (
              <Line key={index} line={line} as="li" />
            ))}
          </ul>
        </>
      )}
    </CvPaper>
  );
}
