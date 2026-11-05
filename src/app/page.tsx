import { sampleProposals } from "@/features/tailor";
import { trackHomeCtaClick } from "@/shared/analytics/actions";
import { brand } from "@/shared/brand";
import { personas } from "@/shared/sample-data";
import { CheckIcon, CvPaper, FitLine, TrackedButtonLink } from "@/shared/ui";

// The real product: Sara's CV with the changes Tailor proposes for her first job, each backed by her own words.
const sara = personas.sara;
const job = sara.jobs[0];
const firstName = sara.profile.fullName.split(" ")[0];
const internship = sara.profile.experience[0];
const changes = sampleProposals.sara.changes;
const rewritten = new Map(changes.flatMap((change) => (change.before ? [[change.before, change.after] as const] : [])));
const addedSkills = changes.filter((change) => change.section === "skills" && change.before === null);
const evidence = changes.find((change) => change.evidenceSource === "follow-up-answer")?.evidence;

export default function HomePage() {
  return (
    <main className="w-full">
      <section className="mx-auto grid max-w-6xl gap-12 px-4 py-12 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-center xl:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] xl:gap-16">
        <div>
          <h1 className="text-4xl leading-[1.05] tracking-tight sm:text-6xl lg:text-5xl xl:text-6xl">{brand.hero.headline}</h1>
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
        </div>

        <figure>
          <CvPaper aria-label={brand.example.label(sara.profile.fullName)} className="text-sm">
            <p className="text-xl font-bold">{sara.profile.fullName}</p>
            <p className="text-text-muted">{sara.profile.contact.location}</p>
            <p className="mt-5 border-b border-line pb-1 font-semibold">Experience</p>
            <p className="mt-3 font-semibold">
              {internship.title}, {internship.company}
            </p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {[...internship.duties, ...internship.achievements].map((line) => {
                const tailored = rewritten.get(line);
                return tailored ? (
                  <FitLine as="li" key={line}>
                    {tailored}
                  </FitLine>
                ) : (
                  <li key={line}>{line}</li>
                );
              })}
            </ul>
            <p className="mt-5 border-b border-line pb-1 font-semibold">Skills</p>
            <p className="mt-3">{sara.profile.skills.join(", ")}</p>
            {addedSkills.map((change) => (
              <FitLine key={change.after} className="mt-1.5">
                {change.after}
              </FitLine>
            ))}
          </CvPaper>
          <figcaption className="mt-5 flex flex-col gap-3 text-sm">
            <p className="font-semibold">{brand.proof}</p>
            {evidence && (
              <div>
                <p className="text-text-muted">{brand.example.evidenceIntro(firstName)}</p>
                <FitLine as="div" className="mt-1.5">
                  <q>{evidence}</q>
                </FitLine>
              </div>
            )}
            <p className="text-text-muted">{brand.example.caption(firstName, job.title, job.company)}</p>
          </figcaption>
        </figure>
      </section>

      <section aria-labelledby="steps-title" className="mx-auto max-w-6xl px-4 pb-16 sm:pb-24">
        <h2 id="steps-title" className="text-3xl">
          {brand.motto}
        </h2>
        <ol className="mt-8 grid gap-8 md:grid-cols-3">
          {brand.steps.map((step, index) => (
            <li key={step.title} className="border-t-2 border-line pt-5">
              <p aria-hidden="true" className="text-3xl font-bold text-accent">
                {index + 1}
              </p>
              <h3 className="mt-3 text-lg">{step.title}</h3>
              <p className="mt-2 max-w-[40ch] text-text-muted">{step.detail}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="promise-title" className="bg-emphasis text-on-emphasis">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
          <h2 id="promise-title" className="text-3xl">
            {brand.promise.title}
          </h2>
          <ul className="mt-8 grid gap-x-12 gap-y-8 sm:grid-cols-2">
            {brand.promise.items.map((item) => (
              <li key={item.title} className="flex gap-3">
                <CheckIcon className="mt-0.5 size-5 shrink-0" />
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
