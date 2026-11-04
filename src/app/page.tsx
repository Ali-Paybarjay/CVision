import { trackHomeCtaClick } from "@/shared/analytics/actions";
import { brand } from "@/shared/brand";
import { CheckIcon, CvPaper, FitLine, MatchMarker, RequirementList, SectionLabel, StatusChip, TrackedButtonLink } from "@/shared/ui";
import { ad, cv, example, matchRows, requirementGroups, type Evidence } from "./_home/sara-example";

// Plan A's home page (docs/design/paper-desk/home.html): the job ad beside Sara's CV, the three steps, the match table
// that says why every line changed, and the Honest CV Promise. Sara and her job are fictional sample data.
const container = "mx-auto w-full max-w-6xl px-4";

export default function HomePage() {
  return (
    <main className="w-full">
      <section className={`${container} grid gap-12 pt-12 pb-16 sm:pt-20 sm:pb-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,36rem)] xl:gap-16`}>
        <div className="lg:pt-10">
          <SectionLabel size="large">{brand.hero.label}</SectionLabel>
          <h1 className="mt-4 text-5xl leading-[1.02] tracking-[-0.035em] sm:text-6xl xl:text-7xl">{brand.hero.headline}</h1>
          <p className="mt-6 max-w-[52ch] text-lg text-text-muted">{brand.hero.subline}</p>
          <div className="mt-8">
            <TrackedButtonLink
              href="/sign-up"
              variant="primary"
              className="w-full sm:w-auto"
              aria-describedby="hero-cta-note"
              onTrack={trackHomeCtaClick.bind(null, { cta: "get_started", placement: "hero" })}
            >
              {brand.cta.primary}
            </TrackedButtonLink>
            <p id="hero-cta-note" className="mt-2 text-sm text-text-muted">
              {brand.cta.primaryNote}
            </p>
          </div>
          <div className="mt-10 flex max-w-xl flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-start sm:justify-between">
            <p className="font-semibold sm:pt-2.5">{brand.cta.cvCheckQuestion}</p>
            <div className="shrink-0">
              <TrackedButtonLink
                href="/cv-check"
                className="w-full sm:w-auto"
                aria-describedby="cv-check-cta-note"
                onTrack={trackHomeCtaClick.bind(null, { cta: "cv_check", placement: "hero" })}
              >
                {brand.cta.cvCheckAction}
              </TrackedButtonLink>
              <p id="cv-check-cta-note" className="mt-2 text-sm text-text-muted">
                {brand.cta.cvCheckNote}
              </p>
            </div>
          </div>
          <p className="mt-8 flex max-w-xl items-start gap-3 font-semibold">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-fit text-accent">
              <CheckIcon className="size-4" />
            </span>
            {brand.proof}
          </p>
        </div>

        <Example />
      </section>

      <section aria-labelledby="steps-title" className={`${container} pb-16 sm:pb-24`}>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-12">
          <h2 id="steps-title" className="text-4xl tracking-[-0.03em] sm:text-5xl">
            {brand.motto}
          </h2>
          <p className="max-w-[40ch] text-text-muted">{brand.stepsIntro}</p>
        </div>
        <ol className="mt-10 grid gap-10 md:grid-cols-3 md:gap-8">
          {brand.steps.map((step, index) => (
            <li key={step.title} className="border-t-2 border-text pt-5">
              <p aria-hidden="true" className="text-5xl font-bold tracking-[-0.03em] text-accent">
                {String(index + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-4 text-lg">{step.title}</h3>
              <p className="mt-2 max-w-[40ch] text-text-muted">{step.detail}</p>
            </li>
          ))}
        </ol>
      </section>

      <MatchTable />

      <section aria-labelledby="promise-title" className="bg-emphasis text-on-emphasis">
        <div className={`${container} grid gap-10 py-16 sm:py-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]`}>
          <div>
            <h2 id="promise-title" className="text-4xl tracking-[-0.03em] sm:text-5xl">
              {brand.promise.title}
            </h2>
            <p className="mt-4">{brand.promise.subtitle}</p>
          </div>
          <ul className="grid gap-x-12 gap-y-8 sm:grid-cols-2">
            {brand.promise.items.map((item) => (
              <li key={item.title} className="flex gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-current">
                  <CheckIcon className="size-4" />
                </span>
                <div>
                  <h3 className="text-lg">{item.title}</h3>
                  <p className="mt-1 max-w-[48ch]">{item.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}

/** Sara's job ad beside her CV: a number joins each tailored CV line to the requirement that asked for it. */
function Example() {
  return (
    <figure aria-labelledby="example-title" className="flex min-w-0 flex-col gap-4">
      <h2 id="example-title" className="text-lg leading-snug">
        {brand.example.title(example.firstName, example.job)}
      </h2>
      <div className="grid items-start gap-4 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
        <div className="rounded-[14px] border border-line bg-surface p-4">
          <SectionLabel as="h3">The job ad</SectionLabel>
          <p className="mt-1.5 font-semibold">{ad.title}</p>
          <p className="text-xs text-text-muted">{[ad.company, ...ad.details].join(" · ")}</p>
          <RequirementList groups={requirementGroups} size="compact" headingLevel="h4" className="mt-4 border-t border-line pt-4" />
        </div>

        <CvPaper shadow aria-label={`${cv.name}’s CV`} className="px-5 py-6 text-[13px] leading-relaxed sm:px-6 sm:py-7">
          <p className="text-lg leading-tight font-bold">{cv.name}</p>
          <p className="text-xs text-cv-ink/70">{cv.contact}</p>

          <CvHeading>Experience</CvHeading>
          <p className="mt-2 font-semibold">{cv.role.heading}</p>
          <p className="text-xs text-cv-ink/70">{cv.role.dates}</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {cv.role.lines.map(({ text, line }) =>
              line ? (
                <FitLine as="li" key={text} className="flex items-start gap-2">
                  <MatchMarker line={line} className="mt-0.5" />
                  <span>{text}</span>
                </FitLine>
              ) : (
                <li key={text}>{text}</li>
              ),
            )}
          </ul>

          <CvHeading>Skills</CvHeading>
          <p className="mt-2">{cv.skills}</p>
          {cv.addedSkills.map(({ text, line }) => (
            <FitLine key={text} className="mt-1.5 flex items-start gap-2">
              <MatchMarker line={line} className="mt-0.5" />
              <span>{text}</span>
            </FitLine>
          ))}

          <CvHeading>Education</CvHeading>
          <p className="mt-2 font-semibold">{cv.education.heading}</p>
          <p>{cv.education.detail}</p>
        </CvPaper>
      </div>
      <figcaption className="text-sm text-text-muted">{brand.example.caption(example.fullName, example.firstName, example.job, example.company)}</figcaption>
    </figure>
  );
}

function CvHeading({ children }: { children: React.ReactNode }) {
  return <SectionLabel className="mt-5 border-b border-cv-ink/15 pb-1 text-cv-ink">{children}</SectionLabel>;
}

/** Why every line of the example changed, or did not: a table on a computer, a list on a phone. */
function MatchTable() {
  const { columns } = brand.match;
  return (
    <section aria-labelledby="match-title" className="border-y border-line bg-surface">
      <div className={`${container} py-16 sm:py-24`}>
        <SectionLabel size="large">{brand.match.label}</SectionLabel>
        <h2 id="match-title" className="mt-3 text-4xl tracking-[-0.03em] sm:text-5xl">
          {brand.match.title}
        </h2>
        <p className="mt-4 max-w-[60ch] text-lg text-text-muted">{brand.match.text}</p>

        <div className="mt-10 hidden overflow-hidden rounded-[14px] border border-line md:block">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{brand.example.title(example.firstName, example.job)}</caption>
            <thead className="bg-canvas">
              <tr>
                {[columns.requirement, columns.need, columns.result, columns.evidence].map((column) => (
                  <th key={column} scope="col" className="px-5 py-3 text-[11px] font-bold tracking-[0.1em] text-text-muted uppercase">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matchRows.map((row) => (
                <tr key={row.text} className="border-t border-line align-top">
                  <th scope="row" className="w-[28%] px-5 py-4 font-semibold">
                    {row.text}
                  </th>
                  <td className="px-5 py-4 text-text-muted">{row.need}</td>
                  <td className="px-5 py-4">
                    <StatusChip status={row.status} line={row.line} />
                  </td>
                  <td className="w-[42%] px-5 py-4">
                    <EvidenceText evidence={row.evidence} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="mt-8 flex flex-col divide-y divide-line border-y border-line md:hidden">
          {matchRows.map((row) => (
            <li key={row.text} className="flex flex-col gap-2 py-5 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">
                  {row.text} <span className="font-normal text-text-muted">· {row.need}</span>
                </p>
                <StatusChip status={row.status} line={row.line} />
              </div>
              <EvidenceText evidence={row.evidence} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function EvidenceText({ evidence }: { evidence: Evidence }) {
  if (evidence.from === "none") {
    return (
      <p className="text-text-muted">
        {brand.match.notAdded}
        {evidence.suggestion && ` ${evidence.suggestion}`}
      </p>
    );
  }
  if (evidence.from === "cv") {
    return (
      <p>
        <span className="text-text-muted">{brand.match.fromCv}</span> “{evidence.quote}”
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      {evidence.before && (
        <p>
          <span className="text-text-muted">{brand.match.before}</span> “{evidence.before}”
        </p>
      )}
      <p>
        <span className="text-text-muted">{brand.match.fromAnswer}</span> “{evidence.quote}”
      </p>
    </div>
  );
}
