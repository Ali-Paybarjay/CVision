@AGENTS.md

# CVision

CVision is a job-application tailoring app for the UK. A user uploads their CV, pastes a job ad, and gets a tailored CV and cover letter. Four teammates build it in parallel, each with their own Claude Code. Brand: `docs/brand.md`.

## Team

| Name | GitHub | Part of the app | Second hat | Reviews the PRs of |
|---|---|---|---|---|
| Ali | `Ali-Paybarjay` | Foundation, brand and dashboard | Tech lead and release: merges into `main` daily | Marzieh |
| Shayan | `shsheytan` | Profile and match | User recruitment and feedback | Nazanin |
| Nazanin | `nazaninpnhi89-oss` | Tailored CV and cover letter | Quality and testing | Shayan |
| Marzieh | `Marzieh-Manager` | CV check and interview practice | Team coordination and the pitch | Ali |

**Advisor: Niusha.** Writes no code and owns no folders. Niusha gives feedback at each station (in the comments of that station's report card), on any issue or PR labelled `needs-advisor`, and on the pitch and rehearsals.

Ask the user which of the four builders they are if it is not clear, then work only in that person's folders.

## Who owns what

| Folder | Owner | What is built there |
|---|---|---|
| `src/app/page.tsx`, `src/app/dashboard`, `src/app/sign-in`, `src/app/sign-up`, `src/app/auth`, `src/app/ui-kit`, `src/features/tracker`, `src/features/account`, `src/shared`, `src/proxy.ts`, `supabase`, `.github` | Ali | Landing page, dashboard, application tracker, account and data rights, shared code, database, CI |
| `src/app/profile`, `src/app/jobs`, `src/features/profile`, `prompts/profile-*` | Shayan | CV upload, Profile, follow-up questions, job ad parsing, matching |
| `src/app/tailor`, `src/features/tailor`, `tests/tailor`, `prompts/tailor-*` | Nazanin | Gap questions, tailored CV and cover letter, export, Apply |
| `src/app/cv-check`, `src/app/interview`, `src/features/cvcheck`, `src/features/interview`, `prompts/cvcheck-*`, `prompts/interview-*` | Marzieh | Free 2-minute CV check, interview practice |
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
12. **Every task has a GitHub Issue.** Name the branch `<area>/<issue number>-<short description>`, where area is `foundation`, `profile`, `tailor`, `cvcheck` or `interview` (e.g. `profile/3-cv-to-profile`), and put `Closes #<issue number>` in the PR description (or `Part of #<n>` when the PR finishes only part of it).

## Shared building blocks

- **Contracts:** `import { ProfileSchema, type Profile } from "@/shared/contracts"`.
- **Sample data:** `import { personas } from "@/shared/sample-data"` gives Sara, Reza, Emma and Daniel, each with a Profile, two Jobs and a MatchResult.
- **AI:** `askModel({ feature, prompt, schema, sample })` from `@/shared/ai`, with `loadPrompt("profile-extract", { cv })` to read `prompts/profile-extract.md` and fill its `{{cv}}` placeholder. In mock mode it returns `sample`; in live mode it asks Claude Haiku 5.5 and checks the answer against `schema`. It adds `prompts/_voice.md` unless you pass `voice: false`.
- **UI kit:** `import { Page, Card, Button, ButtonLink, Field, Input, Textarea, Notice, CvPaper, FitLine } from "@/shared/ui"`. See them all at `/ui-kit`. One `variant="primary"` (Coral) button per page at most. Show the CV inside `CvPaper` (it stays light in dark mode) and mark tailored lines with `FitLine`.
- **Signed-in user:** `getCurrentUser()` from `@/features/account/current-user` (null when signed out). It reads cookies, so call it inside a component wrapped in `<Suspense>`.
- **Database:** `createSupabaseServerClient()` from `@/shared/supabase/server` (or `createSupabaseBrowserClient()` in Client Components) acts as the signed-in user, and row-level security limits them to their own rows. Tables: `profiles`, `jobs`, `match_results`, `tailoring_changes`, `interview_sessions`, `applications`, each with `user_id` and the contract object in `data`. Schema changes go in a new file in `supabase/migrations` (create it with `npx supabase migration new <name>`) and need the team's agreement. Both helpers return null until Supabase is connected, so keep a sample-data path.
- **Usage events:** `track("<area>.<action>", { ...details }, { userId })` from `@/shared/analytics/track`, ideally inside `after()`. Never put CV text or personal details in an event.
- **Anonymous visitors:** pass `requester: await getAnonymousKey()` to `askModel` in the free CV check, and `requester: { userId }` everywhere else, so daily limits apply.
- **Brand:** the name and core copy live only in `src/shared/brand.ts`. Colours are role tokens (`bg-canvas`, `bg-surface`, `text-text`, `text-text-muted`, `border-line`, `text-accent`, `bg-cta`, `text-on-cta`, `bg-fit`, `border-fit-bar`…); Tailwind's default palette is switched off, so `bg-blue-500` and similar do not exist. Never use `dark:` variants: the tokens switch by themselves.

## Commands

- `npm run dev`: start the app at http://localhost:3000
- `npm run lint`, `npm run typecheck`, `npm test`: run all three before every PR
- `npm run eval`: prompt evals (`*.eval.ts`) against the real model; needs `ANTHROPIC_API_KEY` and costs money
- `npm run build`: production build
