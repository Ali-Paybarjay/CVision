import type { Metadata } from "next";
import Link from "next/link";
import { CheckIcon, Page } from "@/shared/ui";

// The privacy notice (card #43). Every fact here was checked against the code, the live project and each
// service's own documentation on 23 October 2026. When a feature starts keeping new data, a new cookie or a new
// browser storage key, update this page and the date below in the same PR.

export const metadata: Metadata = {
  title: "Privacy",
  description: "What CVision keeps about you, where, for how long, who else sees it, and how to download or delete it.",
};

const lastUpdated = "23 October 2026";

/** The page's sections, in order. The deletion message links to #not-deleted-straight-away, so keep that id. */
const contents = [
  { id: "what-we-keep", title: "What we keep and why" },
  { id: "where", title: "Where it’s kept" },
  { id: "who-sees-it", title: "Who else sees it" },
  { id: "how-long", title: "How long we keep it" },
  { id: "not-deleted-straight-away", title: "What isn’t deleted straight away" },
  { id: "cookies", title: "Cookies and browser storage" },
  { id: "your-rights", title: "Your rights" },
] as const;

type SectionId = (typeof contents)[number]["id"];

const link = "font-semibold text-accent hover:underline";

const inShort = [
  "We don’t keep your CV file. We read it, send its text to the AI and discard the file.",
  "Your profile is saved in this browser only, not on our servers.",
  "Your account and the applications you track are stored in London.",
  "The AI services that read your text don’t keep it.",
  "No advertising or analytics cookies, and no cookie banner: everything we store on your device is needed for CVision to work.",
  "You can download or delete your data at any time.",
];

const whatWeKeep: { title: string; body: React.ReactNode }[] = [
  {
    title: "Your account",
    body: (
      <>
        <p>
          Your email address and your password, which we store only in a scrambled form that can’t be turned back into
          your password. We also keep when you signed up and last signed in, and, for each session where you’re signed
          in, your IP address and browser details.
        </p>
        <p>We use these to sign you in.</p>
      </>
    ),
  },
  {
    title: "Your CV and profile",
    body: (
      <>
        <p>
          When you upload your CV, our server reads the file, sends its text to the AI to build your profile, and then
          discards the file. We don’t keep your CV file.
        </p>
        <p>
          We read your CV only with your explicit consent, which you give when you upload it. You check and approve
          every item of your profile before it’s saved, and for now it’s saved in this browser only, not on our
          servers.
        </p>
      </>
    ),
  },
  {
    title: "Your applications",
    body: (
      <p>
        The applications you track on your dashboard: which job each one is for, its status, the date and your next
        step. We keep them with your account, so you can see where each application stands.
      </p>
    ),
  },
  {
    title: "Jobs and interview practice",
    body: (
      <p>
        When you save a job ad to your account, we keep it with your account, together with its match result, the CV
        changes suggested for it and your interview practice for it. Interview practice is also saved in this browser,
        so you can pick up where you left off.
      </p>
    ),
  },
  {
    title: "How CVision is used",
    body: (
      <>
        <p>
          A short record when you do certain things, such as pressing Get started free, changing an application’s
          status or finishing an interview practice (with its scores, how many questions you answered and how long it
          took). These records never include your CV, your answers, the job ad or your contact details.
        </p>
        <p>We use them to see how CVision is used and to make it better.</p>
      </>
    ),
  },
  {
    title: "AI use",
    body: (
      <>
        <p>
          One record for each request to the AI: which feature and model it was for, how much text was processed, what
          it cost and whether it worked. Never the text itself.
        </p>
        <p>We use these to set daily limits on AI use.</p>
      </>
    ),
  },
];

const services: { name: string; body: React.ReactNode }[] = [
  {
    name: "Supabase",
    body: "Runs our database, file storage and sign-in, including the confirmation email you get when you sign up.",
  },
  {
    name: "Vercel",
    body: "Runs the app. Every page you open and every CV you upload passes through it.",
  },
  {
    name: "OpenRouter",
    body: (
      <>
        <p>
          Passes your text to the AI and returns the answer. We don’t send your account ID or email address with it,
          but your CV text may include your name and contact details.
        </p>
        <p>
          OpenRouter deletes the text as soon as the answer is ready, unless the law requires it to keep it or it
          detects misuse. It keeps technical details of each request, such as how much text was processed and how long
          it took. It also says it may categorise a small sample of requests anonymously, without linking them to our
          account.
        </p>
      </>
    ),
  },
  {
    name: "Claude, by Anthropic, on Google Cloud or Amazon Web Services",
    body: (
      <p>
        The AI model that reads your text and writes the answer. We’ve set our OpenRouter account to use only services
        that don’t keep the text (zero data retention), so Google Cloud and Amazon Web Services process it to write the
        answer and don’t store it.
      </p>
    ),
  },
];

const howLong: { what: string; until: string }[] = [
  { what: "Your account and everything saved with it", until: "Until you delete your account." },
  { what: "Usage and AI use records linked to your account", until: "Until you delete your account." },
  { what: "Usage and AI use records made while you weren’t signed in", until: "We haven’t set an end date yet." },
  {
    what: "Your profile and interview practice in this browser",
    until: "Until you delete your account or clear this browser’s data. You can also delete your profile on its own.",
  },
];

const notDeletedStraightAway: { what: string; howLong: string; detail: string }[] = [
  {
    what: "Database backups",
    howLong: "Up to 7 days",
    detail:
      "Supabase backs up our database every day. A copy of your account and the data saved with it can stay in a backup until that backup is replaced. We don’t use these copies. CV files aren’t in these backups: once deleted, they’re gone for good.",
  },
  {
    what: "Supabase’s service logs",
    howLong: "1 day, sign-in logs 1 hour",
    detail: "Each request to our database and sign-in service is logged with your IP address and browser details.",
  },
  {
    what: "Vercel’s request logs",
    howLong: "Up to 30 days",
    detail: "Each page you open is logged with its address, your browser details and your IP address.",
  },
  {
    what: "OpenRouter’s request details",
    howLong: "OpenRouter doesn’t say",
    detail:
      "Technical details of each AI request, such as how much text was processed and how long it took. They don’t include your text and aren’t linked to your CVision account.",
  },
  {
    what: "Records made while you weren’t signed in",
    howLong: "No end date yet",
    detail:
      "Usage and AI use records made while you weren’t signed in are kept against a daily code, not your account, so they can’t be found and deleted with your account.",
  },
  {
    what: "Other browsers and devices",
    howLong: "Until you clear them",
    detail:
      "Deleting your account clears CVision’s data from the browser you use. Data saved in other browsers or on other devices stays there until you clear it.",
  },
];

const cookies: { name: string; purpose: string; howLong: string }[] = [
  {
    name: "sb-…-auth-token",
    purpose:
      "Keeps you signed in. It may be split into parts ending .0, .1 and so on. We refresh it each time you open a page.",
    howLong: "Up to 400 days. Removed when you sign out.",
  },
  {
    name: "sb-…-auth-token-code-verifier",
    purpose:
      "Set while you sign up, so the link in your confirmation email can finish signing you in. Related cookies end in -flow-…-code-verifier and -flows-code-verifier.",
    howLong: "Removed when you use the confirmation link in this browser. Otherwise up to 400 days.",
  },
];

const browserStorage: { name: string; purpose: string; howLong: string }[] = [
  {
    name: "cvision.profile",
    purpose: "Your profile, the record of your consent, and your follow-up questions and answers.",
    howLong: "Until you delete your profile or account, or clear this browser’s data.",
  },
  {
    name: "cvision.interview.v1:…",
    purpose: "Interview practice in progress, one for each job, so you can pick up where you left off.",
    howLong: "Until you delete your account or clear this browser’s data.",
  },
  {
    name: "cvision.storage-check",
    purpose: "Checks that your browser allows storage. It holds nothing.",
    howLong: "Removed straight away.",
  },
];

export default function PrivacyPage() {
  return (
    <Page
      title="Privacy"
      description={
        <>
          <p>What CVision keeps about you, where, for how long, who else sees it, and how to download or delete it.</p>
          <p className="mt-2 text-sm">Last updated {lastUpdated}</p>
        </>
      }
    >
      <section aria-labelledby="in-short-title" className="rounded-lg bg-emphasis p-5 text-on-emphasis sm:p-6">
        <h2 id="in-short-title" className="text-xl">
          In short
        </h2>
        <ul className="mt-4 flex flex-col gap-3">
          {inShort.map((line) => (
            <li key={line} className="flex gap-3">
              <CheckIcon className="mt-0.5 size-5 shrink-0" />
              <span className="max-w-[60ch]">{line}</span>
            </li>
          ))}
        </ul>
      </section>

      <nav aria-labelledby="contents-title">
        <h2 id="contents-title" className="text-lg">
          On this page
        </h2>
        <ul className="mt-2 grid gap-x-8 sm:grid-cols-2">
          {contents.map((section) => (
            <li key={section.id}>
              <a href={`#${section.id}`} className={`inline-flex min-h-11 items-center ${link}`}>
                {section.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <Section id="what-we-keep">
        {whatWeKeep.map((item) => (
          <div key={item.title}>
            <h3 className="text-lg">{item.title}</h3>
            <div className="mt-1 flex flex-col gap-2">{item.body}</div>
          </div>
        ))}
        <p>
          If you use CVision without signing in, the last two kinds of record are kept against a code instead of an
          account. The code is made by scrambling your IP address with a secret key and changes every day. We never
          store your IP address itself.
        </p>
      </Section>

      <Section id="where">
        <p>
          Our database, file storage and sign-in are run by Supabase in London. The app runs on Vercel, also in London,
          although the small step that keeps you signed in may run at the Vercel location nearest to you.
        </p>
        <p>Some processing happens outside the UK:</p>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            Your text reaches the AI through OpenRouter, a US company, and is processed by Claude on Google Cloud or
            Amazon Web Services, in the EU or the US.
          </li>
          <li>
            Vercel is a US company. Its terms say its main processing facilities are in the US and its backups are
            copied to locations around the world.
          </li>
          <li>Supabase says its backups, logs and the services it relies on can be outside the region we chose.</li>
        </ul>
        <p>
          The UK recognises the countries of the European Economic Area, Ireland included, as protecting personal data
          adequately. For transfers to the US, the data processing terms of Supabase, Vercel and OpenRouter use the
          International Data Transfer Addendum issued by the ICO, which adds UK protections to the EU’s Standard
          Contractual Clauses.
        </p>
      </Section>

      <Section id="who-sees-it">
        <dl className="flex flex-col gap-5">
          {services.map((service) => (
            <div key={service.name}>
              <dt className="text-lg font-semibold">{service.name}</dt>
              <dd className="mt-1 flex flex-col gap-2">{service.body}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="how-long">
        <dl className="divide-y divide-line border-y border-line">
          {howLong.map((row) => (
            <div key={row.what} className="grid gap-1 py-3 sm:grid-cols-2 sm:gap-6">
              <dt className="font-semibold">{row.what}</dt>
              <dd>{row.until}</dd>
            </div>
          ))}
        </dl>
        <p>
          When you use Delete my account on your{" "}
          <Link href="/dashboard" className={link}>
            dashboard
          </Link>
          , we delete straight away:
        </p>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>your account, with your email address, password and sign-in sessions</li>
          <li>
            everything saved with it in our database: your applications, saved jobs, matches, suggested CV changes,
            interview practice, usage records and AI use records
          </li>
          <li>any CV files stored with your account</li>
          <li>CVision’s data in the browser you use to delete it.</li>
        </ul>
        <p>
          A few copies and logs take longer to go:{" "}
          <a href="#not-deleted-straight-away" className={link}>
            what isn’t deleted straight away
          </a>
          .
        </p>
      </Section>

      <Section id="not-deleted-straight-away">
        <dl className="flex flex-col gap-5">
          {notDeletedStraightAway.map((item) => (
            <div key={item.what} className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-6">
              <dt>
                <span className="block font-semibold">{item.what}</span>
                <span className="block text-text-muted">{item.howLong}</span>
              </dt>
              <dd>{item.detail}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="cookies">
        <p>
          Every cookie and item of browser storage CVision uses is needed to sign you in or to keep what you entered
          for a feature you asked to use. Under UK law these are strictly necessary, so we don’t ask for consent and
          there’s no cookie banner.
        </p>
        <p>
          We don’t use analytics or advertising cookies, tracking scripts or anything loaded from other websites. Our
          font is served from our own site, so your browser doesn’t contact Google. If you don’t sign up or sign in, we
          don’t set any cookies.
        </p>
        <StorageList title="Cookies" items={cookies} />
        <StorageList title="Browser storage" items={browserStorage} />
        <p>Usage and AI use records are kept on our servers, not on your device.</p>
      </Section>

      <Section id="your-rights">
        <p>UK data protection law (UK GDPR) gives you these rights.</p>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            <span className="font-semibold">To be told how your data is used.</span> This page does that.
          </li>
          <li>
            <span className="font-semibold">To get a copy of your data and take it elsewhere.</span> Use Download my
            data on your{" "}
            <Link href="/dashboard" className={link}>
              dashboard
            </Link>
            . Your profile has its own Download my data button on the{" "}
            <Link href="/profile" className={link}>
              Profile
            </Link>{" "}
            page, because it’s saved in this browser.
          </li>
          <li>
            <span className="font-semibold">To have it corrected.</span> Check and edit your profile on the Profile
            page, and update your applications on your dashboard.
          </li>
          <li>
            <span className="font-semibold">To have it deleted.</span> Use Delete my account on your dashboard, or
            Delete my profile on the Profile page.
          </li>
          <li>
            <span className="font-semibold">To ask us to limit how we use your data, or to object to how we use it.</span>
          </li>
          <li>
            <span className="font-semibold">Not to be subject to decisions made only by a computer.</span> CVision
            makes no such decisions about you: the AI suggests, you approve every change, and we never apply for a job
            on your behalf.
          </li>
        </ul>
        <p>
          If you’re unhappy with how your data is handled, you can{" "}
          <a
            href="https://ico.org.uk/make-a-complaint/data-protection-complaints/data-protection-complaints/"
            className={link}
          >
            complain to the Information Commissioner’s Office (ICO)
          </a>
          , the UK’s data protection regulator, or call its helpline on{" "}
          <a href="tel:03031231113" className={link}>
            0303 123 1113
          </a>
          .
        </p>
      </Section>
    </Page>
  );
}

function Section({ id, children }: { id: SectionId; children: React.ReactNode }) {
  const title = contents.find((section) => section.id === id)?.title;

  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-4 border-t border-line pt-8">
      <h2 id={`${id}-title`} className="text-2xl">
        {title}
      </h2>
      <div className="mt-4 flex max-w-[65ch] flex-col gap-4">{children}</div>
    </section>
  );
}

function StorageList({ title, items }: { title: string; items: { name: string; purpose: string; howLong: string }[] }) {
  return (
    <div>
      <h3 className="text-lg">{title}</h3>
      <dl className="mt-2 divide-y divide-line border-y border-line">
        {items.map((item) => (
          <div key={item.name} className="py-3">
            <dt>
              <code className="text-sm font-semibold break-all">{item.name}</code>
            </dt>
            <dd className="mt-1">{item.purpose}</dd>
            <dd className="mt-1 text-text-muted">{item.howLong}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
