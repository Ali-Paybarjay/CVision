import { Fragment } from "react";
import { cvHeadings, otherLines, type CvEntry, type CvLine, type GroupLine, type TailoredCv } from "@/features/tailor/tailored-cv";
import { cn, CvPaper, FitLine } from "@/shared/ui";

/** The spot "See it on your CV" brings into view and focuses, so a screen reader reads the line (#565). */
const anchor = (line: CvLine) => (line.changeId ? { id: `cv-line-${line.changeId}`, tabIndex: -1 } : {});

/** What a screen reader hears after a tailored line, as the highlight is not seen. */
const spoken = (line: CvLine) => (line.suggested ? " (suggested, not on your CV yet)" : " (tailored for this job)");

/** The tag on a suggestion not decided yet, as on the Tailor v2 canvas (artboard 1). */
function SuggestedTag({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn("inline-block rounded border border-accent bg-cv-paper px-1.5 text-[11px] font-bold text-accent", className)}>
      Suggested
    </span>
  );
}

/** A tailored line is on Fit only when the preview is `marked` (Tailor, #501); otherwise every line looks the
 *  same, as in the download. On the live CV, a suggestion not decided yet has a dashed edge and a "Suggested" tag
 *  instead. A screen reader always hears which lines were tailored, and which are only suggested. No bold inside a
 *  line: only the last section's labels ("Tools:") are bold. */
function Line({ line, as: Tag = "p", marked = false }: { line: CvLine; as?: "p" | "li"; marked?: boolean }) {
  const content = (
    <>
      {line.label && <strong>{line.label} </strong>}
      {line.text}
      {line.tailored && <span className="sr-only">{spoken(line)}</span>}
    </>
  );
  if (marked && line.tailored && line.suggested) {
    return (
      <Tag
        {...anchor(line)}
        className={cn("scroll-mt-24 rounded-md border-[1.5px] border-dashed border-accent bg-fit px-2.5 py-2", Tag === "li" && "-ml-5 list-none")}
      >
        <SuggestedTag className="mr-1.5" />
        {content}
      </Tag>
    );
  }
  if (marked && line.tailored) {
    return (
      <FitLine as={Tag} {...anchor(line)} className="scroll-mt-24">
        {content}
      </FitLine>
    );
  }
  return <Tag>{content}</Tag>;
}

/** A labelled line of the last section, such as "Skills and tools: Excel, SQL, Power BI". With `marked`, only the items the
 *  user approved are on Fit, never the whole line, so the tools they did not change do not look approved (#543). An item
 *  from a suggestion not decided yet has the dashed edge and the "Suggested" tag, never the Fit of an approval (#565). */
function GroupedLine({ line, marked }: { line: GroupLine; marked: boolean }) {
  return (
    <p>
      <strong>{line.label} </strong>
      {line.parts.map((part, index) => {
        // One change can give two languages; only the first of them takes its id.
        const spot = marked && line.parts.findIndex((other) => other.changeId === part.changeId) === index ? anchor(part) : {};
        return (
          <Fragment key={index}>
            {index > 0 && line.separator}
            {/* The screen reader's words sit inside the marked item, so a focused item says it is suggested or tailored (#565). */}
            {marked && part.tailored && part.suggested ? (
              <span className="scroll-mt-24 box-decoration-clone rounded border-[1.5px] border-dashed border-accent bg-fit px-1" {...spot}>
                <SuggestedTag className="mr-1" />
                {part.text}
                <span className="sr-only">{spoken(part)}</span>
              </span>
            ) : marked && part.tailored ? (
              <mark className="scroll-mt-24 box-decoration-clone border-l-2 border-fit-bar bg-fit px-1 text-cv-ink" {...spot}>
                {part.text}
                <span className="sr-only">{spoken(part)}</span>
              </mark>
            ) : (
              <>
                {part.text}
                {part.tailored && <span className="sr-only">{spoken(part)}</span>}
              </>
            )}
          </Fragment>
        );
      })}
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
 * The tailored CV in the layout of the template, as the download will look. `marked` puts the approved lines on Fit, and
 * the suggestions of a live CV (built with `preview`) in a dashed box, for Tailor only (#501, #565): the download and the
 * saved page keep every line plain.
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
