@AGENTS.md

# CVision

CVision is a job-application tailoring app for the UK. A user uploads their CV, pastes a job ad, and gets a tailored CV and cover letter. Four teammates build it in parallel, each with their own Claude Code. Brand: `docs/brand.md`.

## Who owns what

| Folder | Owner | What is built there |
|---|---|---|
| `src/app/page.tsx`, `src/app/dashboard`, `src/features/tracker`, `src/features/account`, `src/shared` | Person 1 | Landing page, dashboard, application tracker, account and data rights, shared code |
| `src/app/profile`, `src/app/jobs`, `src/features/profile`, `prompts/profile-*` | Person 2 | CV upload, Profile, follow-up questions, job ad parsing, matching |
| `src/app/tailor`, `src/features/tailor`, `tests/tailor`, `prompts/tailor-*` | Person 3 | Gap questions, tailored CV and cover letter, export, Apply |
| `src/app/cv-check`, `src/app/interview`, `src/features/cvcheck`, `src/features/interview`, `prompts/cvcheck-*`, `prompts/interview-*` | Person 4 | Free 2-minute CV check, interview practice |
| `prompts`, `sample-data`, `docs` | Shared | Each person adds or edits only their own files |

## Rules

1. **Product:** CVision, a job-application tailoring app for the UK. The user uploads their CV, pastes a job ad, and gets a tailored CV and cover letter.
2. **Stay in your folders.** Change only the folders of the person you are working for. If a task needs a change in someone else's folder, do not touch it; tell the user instead.
3. **Contracts:** the shape of the data lives in `src/shared/contracts` and does not change without the team agreeing.
4. **AI access:** every request to a language model goes through `src/shared/ai` (`askModel`), and prompts live in `prompts/`. In the default mode (`AI_MODE=mock`) no real request is sent.
5. **Brand:** look, copy and tone follow `docs/brand.md`: UK English, a direct and expert tone, and none of the brand's banned words.
6. **Honest CV Promise:** never add a skill or experience without evidence the user gave; never apply a change without the user's approval; the app never applies for a job on the user's behalf; the user can download and fully delete their data.
7. **No secrets in code.** Keys and passwords live only in `.env.local`, which is git-ignored. `.env.example` lists the names with no values.
8. **No real people's data in the repo.** No real CVs or personal details; only the fictional data in `sample-data`.
9. **Branches and PRs:** start every task on a new branch from `main`. Run lint and tests before opening a PR. Keep PRs small.
10. **Tests never call the real model.** Prompt evals run with a separate command.
11. **CI stays lean:** GitHub Actions runs only on push to `main`, pull requests to `main`, and manual runs (`workflow_dispatch`). End-to-end tests run only on `main` or on PRs labelled `e2e`. A new run cancels the previous one (`concurrency`). Changes that touch only documentation do not run CI.

## Shared building blocks

- **Contracts:** `import { ProfileSchema, type Profile } from "@/shared/contracts"`.
- **Sample data:** `import { personas } from "@/shared/sample-data"` gives Sara, Reza, Emma and Daniel, each with a Profile, two Jobs and a MatchResult.
- **AI:** `askModel({ feature, prompt, schema, sample })` from `@/shared/ai`, with `loadPrompt("profile-extract", { cv })` to read `prompts/profile-extract.md` and fill its `{{cv}}` placeholder. In mock mode it returns `sample`; in live mode it asks Claude Haiku 5.5 and checks the answer against `schema`. It adds `prompts/_voice.md` unless you pass `voice: false`.
- **Brand:** the name and core copy live only in `src/shared/brand.ts`. Colours are role tokens (`bg-canvas`, `bg-surface`, `text-text`, `text-text-muted`, `border-line`, `text-accent`, `bg-cta`, `text-on-cta`, `bg-fit`, `border-fit-bar`…); Tailwind's default palette is switched off, so `bg-blue-500` and similar do not exist. Never use `dark:` variants: the tokens switch by themselves.

## Commands

- `npm run dev`: start the app at http://localhost:3000
- `npm run lint`, `npm run typecheck`, `npm test`: run all three before every PR
- `npm run eval`: prompt evals (`*.eval.ts`) against the real model; needs `ANTHROPIC_API_KEY` and costs money
- `npm run build`: production build
