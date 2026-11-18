import { Fragment } from "react";
import { cvHeadings, otherLines, type CvEntry, type CvLine, type GroupLine, type TailoredCv } from "@/features/tailor/tailored-cv";
import { CvPaper, FitLine } from "@/shared/ui";

/** A tailored line is on Fit only when the preview is `marked` (step 3 of Tailor, #501); otherwise every line looks the
 *  same, as in the download. A screen reader always hears which lines were tailored. No bold inside a line: only the last
 *  section's labels ("Tools:") are bold. */
function Line({ line, as: Tag = "p", marked = false }: { line: CvLine; as?: "p" | "li"; marked?: boolean }) {
  const content = (
    <>
      {line.label && <strong>{line.label} </strong>}
      {line.text}
      {line.tailored && <span className="sr-only"> (tailored for this job)</span>}
    </>
  );
  if (marked && line.tailored) return <FitLine as={Tag}>{content}</FitLine>;
  return <Tag>{content}</Tag>;
}

/** A labelled line of the last section, such as "Skills and tools: Excel, SQL, Power BI". With `marked`, only the items the
 *  user approved are on Fit, never the whole line, so the tools they did not change do not look approved (#543). */
function GroupedLine({ line, marked }: { line: GroupLine; marked: boolean }) {
  return (
    <p>
      <strong>{line.label} </strong>
      {line.parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 && line.separator}
          {marked && part.tailored ? <mark className="box-decoration-clone border-l-2 border-fit-bar bg-fit px-1 text-cv-ink">{part.text}</mark> : part.text}
          {part.tailored && <span className="sr-only"> (tailored for this job)</span>}
        </Fragment>
      ))}
    </p>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-6 border-b border-cv-ink/20 pb-1 text-xs font-bold tracking-wider text-accent">{children}</h3>;
}

function Entries({ heading, items, marked }: { heading: string; items: CvEntry[]; marked: boolean }) {
  if (items.length === 0) return null;
  return (
    <>
      <Heading>{heading}</Heading>
      {items.map((item, index) => (
        <div key={index} className="mt-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4">
            <p className="font-semibold">{item.title}</p>
            {item.dates && <p className="text-xs text-cv-ink/70">{item.dates}</p>}
          </div>
          {item.company && <p className="text-cv-ink/70">{item.company}</p>}
          {item.lines.length > 0 && (
            <ul className="mt-1 flex list-disc flex-col gap-1 pl-5">
              {item.lines.map((line, lineIndex) => (
                <Line key={lineIndex} line={line} as="li" marked={marked} />
              ))}
            </ul>
          )}
        </div>
      ))}
    </>
  );
}

/**
 * The tailored CV in the layout of the template, as the download will look. `marked` puts the approved lines on Fit, for
 * step 3 of Tailor only (#501): the download, the overview at the top of the page and the saved page keep every line plain.
 */
export function CvPreview({ cv, marked = false }: { cv: TailoredCv; marked?: boolean }) {
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
            <Line line={cv.summary} marked={marked} />
          </div>
        </>
      )}

      {cv.skills.length > 0 && (
        <>
          <Heading>{cvHeadings.skills}</Heading>
          <ul className="mt-1 grid list-disc grid-flow-col gap-x-6 gap-y-1 pl-5 font-semibold" style={{ gridTemplateRows: `repeat(${Math.ceil(cv.skills.length / 2)}, auto)` }}>
            {cv.skills.map((line, index) => (
              <Line key={index} line={line} as="li" marked={marked} />
            ))}
          </ul>
        </>
      )}

      <Entries heading={cvHeadings.experience} items={cv.experience} marked={marked} />
      <Entries heading={cvHeadings.projects} items={cv.projects} marked={marked} />

      {cv.education.length > 0 && (
        <>
          <Heading>{cvHeadings.education}</Heading>
          <div className="mt-1 flex flex-col gap-1">
            {cv.education.map((line, index) => (
              <Line key={index} line={line} marked={marked} />
            ))}
          </div>
        </>
      )}

      {other.length > 0 && (
        <>
          <Heading>{cvHeadings.other}</Heading>
          <div className="mt-1 flex flex-col gap-1">
            {other.map((line, index) => (
              <GroupedLine key={index} line={line} marked={marked} />
            ))}
          </div>
        </>
      )}
    </CvPaper>
  );
}
