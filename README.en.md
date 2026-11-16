# CVision

**Every application, made to fit.**

CVision is a job-application tailoring app for the UK. You build a profile from your CV, paste a job ad, and get a CV and cover letter tailored to that ad, written only from your own experience. Paste. Tailor. Apply.

- **Live app:** https://cvision-eta.vercel.app
- **فارسی:** [README.md](README.md)

## What it does

- **Free 2-minute CV check:** upload or paste a CV and see how ready it is for UK employers and what to fix first. No sign-up, and nothing is saved.
- **Profile:** upload your CV, or fill in your details if you have no CV, then check and approve each section. Every tailored CV and cover letter is built only from the profile you approve and your own answers.
- **Job ad and match:** paste a job ad's link or its text. CVision lists what the employer is asking for, shows where your profile already matches, quoting the profile line behind each match, and shows the gaps.
- **Tailored CV and cover letter:** answer a few questions about the gaps, then approve or reject each suggested change to your CV; every change is highlighted. The cover letter comes paragraph by paragraph: keep, edit or remove each one, then approve the letter.
- **Download and Apply:** download the CV and cover letter as PDF or Word. Apply opens the job ad in a new tab and adds the job to your tracker. For each job, CVision keeps the CV and cover letter from your latest download or Apply, exactly as they were.
- **Interview practice:** answer interview questions for one of your jobs, with follow-up questions, a score on four criteria and suggested answers drawn from your profile.
- **Dashboard and your data:** follow each application and its next step, see what CVision holds about you, download a copy, or delete your account and data for good.

## The Honest CV Promise

Four promises the app keeps, from the brand guide ([docs/brand.md](docs/brand.md)):

- **Nothing invented:** we never invent experience you don't have. Every claim comes from your CV and what you tell us.
- **You approve everything:** you review and approve everything. We never apply on your behalf.
- **Your data is yours:** download or delete it any time.
- **Sounds like you:** we write from your own words, so it sounds like you, not a template.

In the code, a match quotes a line from your profile word for word as its evidence, and a suggested CV change is kept only when its evidence can be traced word for word to your CV or your own answers ([nothing-invented.ts](src/features/tailor/nothing-invented.ts)).

## Tech stack

- Next.js 16 (App Router), React 19 and TypeScript
- Tailwind CSS 4, with the brand's colours as tokens
- Zod contracts for every shared data shape ([src/shared/contracts](src/shared/contracts))
- Supabase: Postgres with row-level security, Auth and Storage
- Claude Haiku 5.5 through the Anthropic API or OpenRouter, behind one helper (`askModel` in [src/shared/ai](src/shared/ai)), with every prompt in [prompts](prompts)
- pdf-lib and docx for the downloads, unpdf to read uploaded PDFs
- Vitest for unit tests (no network), PGlite for database tests, Playwright for the end-to-end test on a phone screen
- GitHub Actions and Vercel

## Team

Built by a team of four in October and November 2026, each owning one part of the app and its folders:

| Name | GitHub | Part of the app | Second role |
|---|---|---|---|
| Ali | [@Ali-Paybarjay](https://github.com/Ali-Paybarjay) | Foundation, brand, landing page, dashboard, application tracker, account and data rights | Tech lead: contracts, database, production deploys and keys |
| Shayan | [@shsheytan](https://github.com/shsheytan) | CV upload, Profile, job ad reading and matching | Quality and testing |
| Nazanin | [@nazaninpnhi89-oss](https://github.com/nazaninpnhi89-oss) | Gap questions, tailored CV and cover letter, export and Apply | Pilot programme and user feedback |
| Marzieh | [@Marzieh-Manager](https://github.com/Marzieh-Manager) | Free CV check and interview practice | Product, experience and pitch; team coordination |

Each teammate worked with their own Claude Code. The team's rules, who owns which folder, and how pull requests are made are in [CLAUDE.md](CLAUDE.md).

## A note on language

The team worked in Persian, so issues, pull requests and commit messages are in Persian. The code, the prompts and everything in the app are in UK English.

## Run it locally

You need Node.js (CI uses Node 24).

```bash
npm install
npm run dev
```

Then open http://localhost:3000. With no `.env.local`, the app runs in mock mode (`AI_MODE=mock`): no request reaches a model, and you get ready-made sample answers instead, so no API key is needed. Without Supabase, sign-in only shows a notice and nothing is stored in a database. All sample data is fictional ([sample-data](sample-data)).

To use the real model or a database, copy `.env.example` to `.env.local` and fill in the values it describes.

Other commands:

- `npm run lint`, `npm run typecheck` and `npm test`: lint, type check and unit tests
- `npm run test:e2e`: the end-to-end test of the main path (the first time, run `npx playwright install chromium`)
- `npm run eval`: prompt evals against the real model; needs `ANTHROPIC_API_KEY` or `OPENROUTER_API_KEY` and costs money
