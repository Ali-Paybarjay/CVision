// The Tailor layout with empty slots and no user data, to review the structure before real data is wired in.
// Every [Bracketed] text marks where the user's Profile, Job and MatchResult will go.

function Slot({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-canvas px-1 text-text-muted">[{children}]</span>;
}

function CvSlot({ children }: { children: React.ReactNode }) {
  return <span className="text-cv-ink/60">[{children}]</span>;
}

export default function TailorTemplatePage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold">Tailor</h1>
        <span className="rounded-full border border-line px-3 py-1 text-xs text-text-muted">Template · no data yet</span>
      </div>
      <p className="mt-2 text-lg">
        <Slot>Job title</Slot> at <Slot>Employer</Slot>
      </p>
      <p className="mt-1 text-text-muted">Review each suggested change before it goes into your CV.</p>

      {/* Summary bar */}
      <div className="mt-6 flex flex-wrap gap-4 rounded-lg border border-line bg-surface px-4 py-3 text-sm" aria-live="polite">
        <span>✓ Approved: 0</span>
        <span>✕ Rejected: 0</span>
        <span>Waiting: 0</span>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_minmax(0,28rem)]">
        <div className="space-y-10">
          {/* 1. One question per gap */}
          <section>
            <h2 className="text-xl">1. Questions about your experience</h2>
            <p className="mt-1 text-sm text-text-muted">One question for each requirement your CV does not show yet.</p>
            <div className="mt-4 rounded-lg border border-line bg-surface p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                <Slot>Essential or desirable</Slot>
              </p>
              <p className="mt-2 font-semibold">
                <Slot>Requirement from the job ad</Slot>
              </p>
              <blockquote className="mt-2 border-l-2 border-line pl-3 text-sm text-text-muted">
                The ad says: “<Slot>quote from the job ad</Slot>”
              </blockquote>
              <label htmlFor="answer-template" className="mt-4 block">
                <Slot>Plain question about what you have done, about 25 words</Slot>
              </label>
              <textarea
                id="answer-template"
                rows={3}
                placeholder="Answer in your own words: where, what you did and what changed."
                className="mt-2 w-full rounded-md border border-text-muted bg-surface p-3 text-text"
              />
              <div className="mt-3 flex flex-wrap gap-3">
                <button type="button" className="rounded-md bg-cta px-4 py-2 text-sm font-semibold text-on-cta">
                  Save answer
                </button>
                <button type="button" className="rounded-md border border-line px-4 py-2 text-sm font-semibold">
                  I haven’t done this
                </button>
              </div>
            </div>
          </section>

          {/* 2. Suggested changes */}
          <section>
            <h2 className="text-xl">2. Suggested changes</h2>
            <p className="mt-1 text-sm text-text-muted">Only changes you approve go into your CV.</p>
            <div className="mt-4 rounded-lg border border-line bg-surface p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                <Slot>CV section</Slot>
              </p>
              <div className="mt-3 rounded border border-line bg-cv-paper p-4 text-cv-ink">
                <p className="text-xs font-semibold">Before</p>
                <p className="mt-1 text-cv-ink/70 line-through">
                  <CvSlot>Current line on your CV</CvSlot>
                </p>
                <p className="mt-4 text-xs font-semibold">After</p>
                <p className="mt-1 border-l-4 border-fit-bar bg-fit py-1 pl-3">
                  <CvSlot>Suggested line, in your own words</CvSlot>
                </p>
              </div>
              <p className="mt-3 text-sm text-text-muted">
                <span className="font-semibold">From what you told us:</span> “<Slot>your words, quoted exactly</Slot>”
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button type="button" className="rounded-md border border-accent px-4 py-2 text-sm font-semibold text-accent">
                  Approve
                </button>
                <button type="button" className="rounded-md border border-line px-4 py-2 text-sm font-semibold">
                  Reject
                </button>
                <span className="text-sm text-text-muted">Waiting for your decision</span>
              </div>
            </div>
          </section>

          {/* 3. Gaps with no evidence */}
          <section>
            <h2 className="text-xl">3. Not added to your CV</h2>
            <div className="mt-4 rounded-lg border border-line bg-surface p-4">
              <p className="font-semibold">
                <Slot>Requirement</Slot>
              </p>
              <p className="mt-1 text-text-muted">
                <Slot>You said you haven’t done this yet, so we won’t add it.</Slot>
              </p>
              <dl className="mt-3 space-y-2 text-sm">
                <div>
                  <dt className="font-semibold">Closest real skill</dt>
                  <dd className="text-text-muted">
                    <Slot>a skill already on your CV, and how it relates</Slot>
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold">A way to learn it</dt>
                  <dd className="text-text-muted">
                    <Slot>what to learn, why it helps, rough effort</Slot>
                  </dd>
                </div>
              </dl>
            </div>
          </section>
        </div>

        {/* CV preview: always Paper with Ink text, in light and dark mode */}
        <aside aria-label="CV preview" className="lg:sticky lg:top-6 lg:self-start">
          <h2 className="text-xl">Your CV</h2>
          <article className="mt-4 rounded-sm border border-line bg-cv-paper p-6 text-sm text-cv-ink">
            <p className="text-2xl font-bold">
              <CvSlot>Full name</CvSlot>
            </p>
            <p className="mt-1">
              <CvSlot>Email · Phone · Location</CvSlot>
            </p>

            <h3 className="mt-6 border-b border-cv-ink/20 pb-1 font-semibold">Professional summary</h3>
            <p className="mt-2">
              <CvSlot>Summary</CvSlot>
            </p>

            <h3 className="mt-6 border-b border-cv-ink/20 pb-1 font-semibold">Skills</h3>
            <p className="mt-2">
              <CvSlot>Skill</CvSlot>, <CvSlot>Skill</CvSlot>, <CvSlot>Skill</CvSlot>
            </p>

            <h3 className="mt-6 border-b border-cv-ink/20 pb-1 font-semibold">Experience</h3>
            <p className="mt-2 font-semibold">
              <CvSlot>Job title</CvSlot>, <CvSlot>Employer</CvSlot>
            </p>
            <p className="text-cv-ink/70">
              <CvSlot>Start – End</CvSlot>
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <CvSlot>Bullet from your CV</CvSlot>
              </li>
              <li className="border-l-4 border-fit-bar bg-fit py-1 pl-2">
                <CvSlot>Approved change appears here, highlighted</CvSlot>
              </li>
            </ul>

            <h3 className="mt-6 border-b border-cv-ink/20 pb-1 font-semibold">Education</h3>
            <p className="mt-2">
              <CvSlot>Qualification, Institution</CvSlot>
            </p>

            <h3 className="mt-6 border-b border-cv-ink/20 pb-1 font-semibold">Additional information</h3>
            <p className="mt-2">
              <CvSlot>Certifications, languages</CvSlot>
            </p>
          </article>
        </aside>
      </div>

      {/* Empty state, shown when there is no CV or job ad yet */}
      <section className="mt-12 rounded-lg border border-dashed border-line p-6 text-center">
        <p className="font-semibold">Empty state</p>
        <p className="mt-1 text-text-muted">Upload your CV and paste a job ad to start tailoring.</p>
      </section>
    </main>
  );
}
