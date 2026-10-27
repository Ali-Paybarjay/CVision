@AGENTS.md

# CVision

CVision is a job-application tailoring app for the UK. A user uploads their CV, pastes a job ad, and gets a tailored CV and cover letter. Four teammates build it in parallel, each with their own Claude Code. Brand: `docs/brand.md`.

## Team

| Name | GitHub | Part of the app | Second hat | Reviews by default |
|---|---|---|---|---|
| Ali | `Ali-Paybarjay` | Foundation, brand and dashboard | Tech lead: contracts, database, production deploys and keys | Marzieh's PRs |
| Shayan | `shsheytan` | Profile and match | Quality and testing: test checklist, bug severity, banned-words and UK English test | Nazanin's PRs, and Ali's PRs about AI, data or the database |
| Nazanin | `nazaninpnhi89-oss` | Tailored CV and cover letter | Pilot programme and user feedback: pilot users, invites, feedback form, usability tests | Shayan's PRs, and Marzieh's when Ali is busy |
| Marzieh | `Marzieh-Manager` | CV check and interview practice | Product, experience and pitch: app walkthroughs as a new user, feedback and bug-fix priority, demo and slides; plus team coordination (daily call, board, organiser) | Ali's PRs about pages, copy and the user's path |

Decisions are the team's own: nothing waits for anyone outside the four builders, and the `needs-advisor` label is retired. Anyone may review any PR; the last column only says who the author asks first.

Ask the user which of the four builders they are if it is not clear, then work only in that person's folders. Work for a second hat goes on a branch in its owner's own area, e.g. `tailor/<n>-pilot-feedback-form`.

## Language

- **Persian (Farsi) for the team.** Everything teammates read on GitHub is written in Persian: issue and PR titles and descriptions, comments, review comments, and commit messages. Reply to the user in Persian too.
- **PR titles:** `#<PR number> · <author> · <goal>`, where the goal is one short, plain Persian sentence on what the PR does for the app, e.g. `#27 · شایان · رزومه را می‌خواند، Profile می‌سازد و پرسش تکمیلی می‌پرسد`. When you open a PR, write only the goal as its title: the PR title workflow (`.github/workflows/pr-title.yml`) adds the number and the author's name, and corrects them if they are wrong. Nobody types them by hand.
- **English for the product and the code.** Code, identifiers, file, folder and branch names (rule 12), prompts, and everything users see in the app stay in English; app copy and AI output are UK English, as the brand requires.

## Who owns what

| Folder | Owner | What is built there |
|---|---|---|
| `src/app/page.tsx`, `src/app/dashboard`, `src/app/privacy`, `src/app/sign-in`, `src/app/sign-up`, `src/app/auth`, `src/app/ui-kit`, `src/features/tracker`, `src/features/account`, `src/shared`, `src/proxy.ts`, `supabase`, `.github` | Ali | Landing page, dashboard, privacy page, application tracker, account and data rights, shared code, database, CI |
| `src/app/profile`, `src/app/jobs`, `src/features/profile`, `prompts/profile-*`, `tests/quality` | Shayan | CV upload, Profile, follow-up questions, job ad parsing, matching; the test checklist and app-wide quality tests |
| `src/app/tailor`, `src/features/tailor`, `tests/tailor`, `prompts/tailor-*`, `docs/pilot` | Nazanin | Gap questions, tailored CV and cover letter, export, Apply; pilot programme guides (blank templates, no real data) |
| `src/app/cv-check`, `src/app/interview`, `src/features/cvcheck`, `src/features/interview`, `prompts/cvcheck-*`, `prompts/interview-*` | Marzieh | Free 2-minute CV check, interview practice |
| `prompts`, `sample-data`, `docs` | Shared | Each person adds or edits only their own files |
| `tests/e2e` | Shared | The end-to-end test of the main path. Whoever changes a page updates that page's step in the same PR (rule 2) |

## Rules

1. **Product:** CVision, a job-application tailoring app for the UK. The user uploads their CV, pastes a job ad, and gets a tailored CV and cover letter.
2. **Stay in your folders.** Change only the folders of the person you are working for, with two exceptions that stop one problem from turning into five PRs: a fix that every feature needs (cleaning text before it reaches the model, a shared check, a shared helper) goes into `src/shared` once, by whoever found it, with one line to Ali in the PR description; and whoever changes a page updates that page's step in `tests/e2e` in the same PR. Anything else in someone else's folder: do not touch it; tell the user instead.
3. **Contracts:** the shape of the data lives in `src/shared/contracts`. Adding an optional field (`.optional()`, never `.default()`) takes one PR that says who writes the field and who reads it; when nobody has objected on that PR after 24 hours, its reviewer merges it. Removing or renaming a field, or changing what a value means, is a breaking change and needs the team's yes in the daily call first.
4. **AI access:** every request to a language model goes through `src/shared/ai` (`askModel`), and prompts live in `prompts/`. In the default mode (`AI_MODE=mock`) no real request is sent.
5. **Brand:** look, copy and tone follow `docs/brand.md`: UK English, a direct and expert tone, and none of the brand's banned words.
6. **Honest CV Promise:** never add a skill or experience without evidence the user gave; never apply a change without the user's approval; the app never applies for a job on the user's behalf; the user can download and fully delete their data.
7. **No secrets in code.** Keys and passwords live only in `.env.local`, which is git-ignored. `.env.example` lists the names with no values.
8. **No real people's data in the repo.** No real CVs or personal details; only the fictional data in `sample-data`.
9. **Branches and PRs:** start every task on a new branch from `main`. Each person works on one PR at a time and has at most two open, the second only while the first waits for review; never build one PR on top of another (the repository squash-merges, so a chain of PRs conflicts with itself). Run lint and tests before opening a PR. Keep PRs small: under about 400 changed lines unless the card says why.
10. **Tests never call the real model.** Prompt evals run with a separate command. Unit tests cannot reach the network at all: a `fetch` to anywhere but localhost fails, and `ANTHROPIC_API_KEY` is empty (`src/shared/testing/no-network.ts`), so mock every outside service.
11. **CI stays lean:** GitHub Actions runs only on push to `main`, pull requests to `main`, and manual runs (`workflow_dispatch`). The one scheduled job is `daily-stats.yml`, which also runs once a day at 08:00 UTC to post the pilot's active-user totals on card #127. End-to-end tests run only on `main` or on PRs labelled `e2e`. A new run cancels the previous one (`concurrency`). A push to `main` that touches only documentation starts no CI run. A pull request that touches only documentation still runs CI, but "Lint, typecheck, test and build" skips its steps and passes, and the end-to-end tests do not run.
12. **Every task has a GitHub Issue,** except housekeeping (rule 15). Name the branch `<area>/<issue number>-<short description>`, where area is `foundation`, `profile`, `tailor`, `cvcheck` or `interview` (e.g. `profile/3-cv-to-profile`), and put `Closes #<issue number>` in the PR description (or `Part of #<n>` when the PR finishes only part of it).
13. **One owner per PR.** Every PR has one owner, its author, and sits on the team board, so everyone can see who is finishing what. The PR title workflow makes the author its assignee if nobody is. When a piece of work spans more than one person, each person opens and finishes only their own PR, linked to the same card (rule 12); nobody finishes or pushes to someone else's PR. Merging is the reviewer's job (rule 14).
14. **Review and merge: approve means merge.** Before asking for a human review, the author asks Claude Code to review the diff and fixes what it finds, so the human review is one round. The author requests the default reviewer from the Team table; anyone may review any PR, and a PR that has waited four working hours goes to whoever is free. The reviewer answers within four working hours. When the reviewer approves and CI is green, that same reviewer merges at once (squash merge); nothing waits for a daily merge by Ali, who merges only the PRs he reviews. A changes-requested review says which points block and which are suggestions; suggestions become a card, not another round.
15. **Housekeeping needs no card.** A change that does not change what the app does (docs, `CLAUDE.md`, code comments, lint or format settings, names in `.env.example`) needs no issue: collect it in the week's housekeeping PR (branch `housekeeping/<date>`, with the goal part of the title starting with `خانه‌تکانی:`; the PR title workflow adds the number and name in front) or open a one-line PR; any approve merges it. Never open a card, a branch and a PR for each one-line fix.
16. **No new process tooling until the demo.** The workflows, the PR title job, lint and CI settings are finished. Change them only when something is broken, in a PR that says what broke. The time goes to the user's main path instead.

## Working rhythm until the demo

- **Daily call: 15 minutes, for unblocking.** Each person says one thing: what they are waiting on and from whom. Status lives on the board, not in the call.
- **Board:** a "Waiting on" column holds every card or PR that waits on someone else, with that person's name. Open PRs follow rule 9: one in progress, and a second only while the first waits for review.
- **Priorities until the feature freeze (Wednesday 4 November):** the main path first: upload the CV, paste the job ad, tailored CV and cover letter, download, Apply. Follow-up drafts (#70), interview phase 2 (#32), reports and analytics wait until after the demo unless Marzieh (product) says a user needs them now.
- **Two numbers, checked every Monday:** the median time from opening a PR to `main` for PRs not written by Ali (target: under 6 hours), and the share of PRs that are tooling, CI or docs (target: under 20%).

## Shared building blocks

- **Contracts:** `import { ProfileSchema, type Profile } from "@/shared/contracts"`.
- **Sample data:** `import { personas } from "@/shared/sample-data"` gives Sara, Reza, Emma and Daniel, each with a Profile, two Jobs and a MatchResult.
- **AI:** `askModel({ feature, prompt, schema, sample })` from `@/shared/ai`, with `loadPrompt("profile-extract", { cv })` to read `prompts/profile-extract.md` and fill its `{{cv}}` placeholder. In mock mode it returns `sample`; in live mode it asks Claude Haiku 5.5 and checks the answer against `schema`. It adds `prompts/_voice.md` unless you pass `voice: false`. Pass `onUsage` to get the real tokens and cost of each live request (a retry counts as a request of its own).
- **UI kit:** `import { Page, Card, Button, ButtonLink, Field, Input, Textarea, Notice, CvPaper, FitLine } from "@/shared/ui"`. See them all at `/ui-kit`. One `variant="primary"` (Coral) button per page at most. Show the CV inside `CvPaper` (it stays light in dark mode) and mark tailored lines with `FitLine`.
- **Signed-in user:** `getCurrentUser()` from `@/features/account/current-user` (null when signed out). It reads cookies, so call it inside a component wrapped in `<Suspense>`. To send a signed-out user to sign in and back to your page, link to `withNext("/sign-in", "/interview?job=…")` from `@/features/account/safe-redirect` (it encodes the page into `?next=`).
- **Database:** `createSupabaseServerClient()` from `@/shared/supabase/server` (or `createSupabaseBrowserClient()` in Client Components) acts as the signed-in user, and row-level security limits them to their own rows. Tables: `profiles`, `jobs`, `match_results`, `tailoring_changes`, `interview_sessions`, `applications`, `tailored_cvs`, each with `user_id` and the contract object in `data`. Schema changes go in a new file in `supabase/migrations` (create it with `npx supabase migration new <name>`) and follow rule 3: a new table, view, function or nullable column is like an optional field (one PR that says who writes and who reads it, merged by its reviewer after 24 hours with no objection); dropping or renaming a table or column, or changing what one means, is a breaking change and needs the team's yes in the daily call first. Both helpers return null until Supabase is connected, so keep a sample-data path.
- **Usage events:** `track("<area>.<action>", { ...details }, { userId })` from `@/shared/analytics/track`, ideally inside `after()`. Never put CV text or personal details in an event.
- **Anonymous visitors:** pass `requester: await getAnonymousKey()` to `askModel` in the free CV check, and `requester: { userId }` everywhere else, so daily limits apply.
- **Brand:** the name and core copy live only in `src/shared/brand.ts`. Colours are role tokens (`bg-canvas`, `bg-surface`, `text-text`, `text-text-muted`, `border-line`, `text-accent`, `bg-cta`, `text-on-cta`, `bg-fit`, `border-fit-bar`…); Tailwind's default palette is switched off, so `bg-blue-500` and similar do not exist. Never use `dark:` variants: the tokens switch by themselves.

## Commands

- `npm run dev`: start the app at http://localhost:3000
- `npm run lint`, `npm run typecheck`, `npm test`: run all three before every PR
- `npm run test:e2e`: the end-to-end test of the main path on a phone (Playwright, mock mode, no Supabase, `tests/e2e`). The first time, run `npx playwright install chromium`. CI runs it on `main` and on PRs labelled `e2e`
- `npm run eval`: prompt evals (`*.eval.ts`) against the real model; needs `ANTHROPIC_API_KEY` or `OPENROUTER_API_KEY` and costs money. Wrap each eval suite in `describe.skipIf(!getAiProvider())` so it runs with either key. Anyone can also run them from the Actions tab with the `eval` workflow, which reads the key from GitHub Secrets, so no key sits on anyone's computer; it warns about skipped evals and fails when none ran
- `npm run build`: production build
