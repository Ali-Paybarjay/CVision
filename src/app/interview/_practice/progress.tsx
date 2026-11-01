"use client";

// "Preparing your interview" (#232): about 2 minutes from Start to the first question. The card never leaves the user
// guessing. It says how long is left and which stage is working; it puts what the first stage found to use while the
// rest runs; and it says plainly when a stage is slow, is being tried again, or needs Try again (the steps already
// done are kept). Start again stays out of the way meanwhile (practice.tsx), so nobody throws away a start that is fine.
import { useEffect, useRef, useState } from "react";
import { defaultComposition, levelDescriptions, overrunGraceSeconds, startupSeconds } from "@/features/interview/config";
import type { Competency, InterviewSession, LevelBand } from "@/features/interview/contracts";
import { mainAnswer } from "@/features/interview/engine/session";
import { technicalV1 } from "@/features/interview/rubrics";
import { retryStartupStage } from "./flow";
import type { JobState, PracticeStore } from "./store";
import { Button, Card } from "@/shared/ui";
import { firstQuestionId, Status } from "./ui";

const questionCount = defaultComposition.technical + defaultComposition.behavioural;

export const startupStages = [
  { key: "analyse", label: "Reading the role and your profile" },
  { key: "generate", label: `Writing ${questionCount} questions for this job` },
  // What the review stage checks, so a third step makes sense to the person waiting for it.
  { key: "review", label: "Checking each question is clear, fair and at the right level" },
] as const;

/** Each stage's usual share of the wait. */
const stageBudgetMs = (startupSeconds * 1000) / startupStages.length;

/** The level the role is pitched at, in words, from its description ("Junior: …" is "junior level"): never the L1 to L5 code. */
function levelName(level: LevelBand): string {
  return `${levelDescriptions[level].split(":")[0].toLowerCase()} level`;
}

/** "a, b and c", the UK way. */
const listOf = (items: string[]) => new Intl.ListFormat("en-GB", { type: "conjunction" }).format(items);

/** Lines from the profile shown while waiting: enough to think about, few enough to read on a phone. */
const claimsShown = 3;

export type PreparationState = "preparing" | "failed" | "ready";

/** How many startup stages are done: 3 once the questions are checked. */
export function stagesDone(session: InterviewSession | null): number {
  return !session ? 0 : !session.questions.length ? 1 : !session.reviewChangelog ? 2 : 3;
}

/** Where the start is: still preparing, stopped at a stage that needs Try again, or ready (the questions are checked). */
export function preparationState(session: InterviewSession | null, jobs: Readonly<Record<string, JobState>>, run: string): PreparationState {
  if (stagesDone(session) === startupStages.length) return "ready";
  return startupStages.some((stage) => jobs[`${run}:${stage.key}`]?.status === "failed") ? "failed" : "preparing";
}

/** The usual wait, said once before it starts: "about 2 minutes". */
export function startupEstimate(): string {
  return startupSeconds > 90 ? `about ${Math.round(startupSeconds / 60)} minutes` : `about ${startupSeconds} seconds`;
}

/**
 * How full the bar is, from 0 to 1: the stages done, plus the working stage's share by its own clock, stopping just
 * short of the stage's end. So it reaches the end only when the questions are ready, and a stage that finishes early
 * moves it on at once. The card never lets it go back (a second try starts its clock again).
 */
export function startupFraction(done: number, stageElapsedMs: number): number {
  if (done >= startupStages.length) return 1;
  return (done + Math.min(Math.max(stageElapsedMs, 0) / stageBudgetMs, 0.9)) / startupStages.length;
}

/**
 * The words in the card's corner: what is left of the working stage and the stages after it, rounded ("About 2 minutes
 * left", then in tens of seconds, then "Almost ready"). Once the working stage runs past its usual share, it says so,
 * rather than standing still on a number, and past twice its share it drops "a little".
 */
export function timeLeft(done: number, stageElapsedMs: number): string {
  const elapsed = Math.max(stageElapsedMs, 0);
  const grace = overrunGraceSeconds * 1000;
  if (elapsed > 2 * stageBudgetMs + grace) return "Taking longer than usual";
  if (elapsed > stageBudgetMs + grace) return "Taking a little longer than usual";
  const left = Math.round(((startupStages.length - done) * stageBudgetMs - Math.min(elapsed, stageBudgetMs)) / 1000);
  if (left > 90) return `About ${Math.round(left / 60)} minutes left`;
  return left > 10 ? `About ${Math.ceil(left / 10) * 10} seconds left` : "Almost ready";
}

/**
 * What a screen reader hears; the bar and the countdown are for the eyes. A failed stage, a stage tried again, the end
 * of each stage, and last that question 1 is here, but only while it is still unanswered, so a reload later in the
 * practice or a finished one says nothing.
 */
export function startupMessage(session: InterviewSession | null, jobs: Readonly<Record<string, JobState>>, run: string): string {
  for (const stage of startupStages) {
    const job = jobs[`${run}:${stage.key}`];
    if (job?.status === "failed") return `Failed: ${stage.label}. ${job.message}`;
    if (job?.status === "running" && job.retrying) return `Trying again: ${stage.label}.`;
  }
  const done = stagesDone(session);
  if (!session || done === 0) return "";
  if (done < startupStages.length) return `Done: ${startupStages[done - 1].label}.`;
  const first = session.questions[0];
  return !session.endedAt && mainAnswer(session, first.id) === null
    ? `Your ${session.questions.length} questions are ready. Question 1 is below.`
    : "";
}

/** The time now, once a second while `ticking`. */
function useNow(ticking: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [ticking]);
  return now;
}

/** True when nothing on the page has focus, as after the focused button or card was removed. */
function focusIsLost(): boolean {
  return !document.activeElement || document.activeElement === document.body;
}

/**
 * While this tab is hidden, its title says when the questions are ready or a stage needs Try again, so nobody has to
 * watch a 2-minute wait. The page's own title comes back as soon as the tab is seen again.
 */
function useTabTitle(state: PreparationState) {
  const previous = useRef(state);
  useEffect(() => {
    const was = previous.current;
    previous.current = state;
    if (was !== "preparing" || state === "preparing" || !document.hidden) return;
    const original = document.title;
    document.title = `${state === "ready" ? "Questions ready" : "Needs your attention"} · ${original}`;
    const restore = () => {
      if (!document.hidden) document.title = original;
    };
    document.addEventListener("visibilitychange", restore);
    return () => {
      document.removeEventListener("visibilitychange", restore);
      document.title = original;
    };
  }, [state]);
}

export function Progress({
  store,
  session,
  jobs,
  run,
}: {
  store: PracticeStore;
  session: InterviewSession | null;
  jobs: Readonly<Record<string, JobState>>;
  run: string;
}) {
  const state = preparationState(session, jobs, run);
  useTabTitle(state);

  // When the questions arrive in this tab and the card's focus went with it, question 1's line takes focus: not the
  // answer box, which would open the keyboard on a phone.
  const wasReady = useRef(state === "ready");
  useEffect(() => {
    if (state === "ready" && !wasReady.current && focusIsLost()) document.getElementById(firstQuestionId)?.focus();
    wasReady.current = state === "ready";
  }, [state]);

  // The first question takes the card's place; how long the start took is for the lab only (#243). The status line
  // stays in the same place outside the card, so "Your questions are ready" is still heard when the card goes.
  return (
    <>
      {state !== "ready" && <PreparingCard store={store} session={session} jobs={jobs} run={run} />}
      <p role="status" className="sr-only">
        {startupMessage(session, jobs, run)}
      </p>
    </>
  );
}

function PreparingCard({ store, session, jobs, run }: Parameters<typeof Progress>[0]) {
  const done = stagesDone(session);
  const working = startupStages[done];
  const job = jobs[`${run}:${working.key}`];
  const failure = job?.status === "failed" ? job : null;
  const failed = failure !== null;
  const retrying = job?.status === "running" && job.retrying === true;

  // Nothing moves while a stage waits for Try again.
  const now = useNow(!failed);
  // The working stage's clock: from its request's current try in this tab, or from when it became the working stage
  // here (a reload, or a second tab waiting for the first). So a reload or Try again starts it again, not the old time.
  const [became, setBecame] = useState(() => ({ done, at: Date.now() }));
  if (became.done !== done) setBecame({ done, at: now });
  const since = job?.status === "running" && job.since ? job.since : became.at;
  const stageElapsedMs = Math.max(0, now - since);

  // The bar never goes back, even when a stage starts a second try.
  const fraction = startupFraction(done, stageElapsedMs);
  const [bar, setBar] = useState({ run, value: fraction });
  const shown = bar.run === run ? Math.max(bar.value, fraction) : fraction;
  if (bar.run !== run || shown !== bar.value) setBar({ run, value: shown });

  // "Start practice" is gone once this card appears, so focus moves to its heading rather than to nothing.
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusIsLost()) heading.current?.focus();
  }, []);

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 ref={heading} tabIndex={-1} className="text-xl">
          Preparing your interview
        </h2>
        {!failed && <p className="text-sm text-text-muted tabular-nums">{timeLeft(done, stageElapsedMs)}</p>}
      </div>
      <div aria-hidden="true" className="h-2 overflow-hidden rounded-full border border-line bg-canvas">
        <div
          className="h-full rounded-full bg-fit-bar transition-[width] duration-1000 ease-linear motion-reduce:transition-none"
          style={{ width: `${(shown * 100).toFixed(1)}%` }}
        />
      </div>
      <ol className="space-y-2">
        {startupStages.map((stage, index) => (
          // Two columns, so on a phone a long stage name wraps beside its chip, not under it.
          <li key={stage.key} className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2 gap-y-1">
            {index < done ? (
              <Status tone="accent">Done</Status>
            ) : index > done ? (
              <Status tone="pending">Waiting</Status>
            ) : failed ? (
              <Status tone="error">Failed</Status>
            ) : (
              <Status tone="working">{retrying ? "Trying again…" : "Working…"}</Status>
            )}
            <span className={index === done ? "font-semibold" : index > done ? "text-text-muted" : undefined}>{stage.label}</span>
            {index === done && retrying && (
              <p className="col-start-2 text-sm text-text-muted">That step did not finish, so we are running it once more.</p>
            )}
            {index === done && failure && (
              <div className="col-start-2 space-y-2">
                <p className="text-sm text-error">{failure.message}</p>
                {done > 0 && <p className="text-sm text-text-muted">The steps already done are kept.</p>}
                <Button
                  variant="primary"
                  onClick={() => {
                    retryStartupStage(store, run, `${run}:${stage.key}`);
                    // The button goes with the failure: focus returns to the card's heading.
                    heading.current?.focus();
                  }}
                >
                  Try again
                </Button>
              </div>
            )}
          </li>
        ))}
      </ol>
      <p className="text-sm text-text-muted">Keep this page open. You can use another tab while you wait.</p>
      {/* Below the line, something to use the wait for: the scoring from the start, what the role asks for after stage 1. */}
      <div className="space-y-4 border-t border-line pt-4">
        {session && <WhileYouWait session={session} />}
        <p className="text-sm text-text-muted">
          Each answer is scored on {listOf(technicalV1.dimensions.map((dimension) => dimension.label.toLowerCase()))}.
        </p>
      </div>
    </Card>
  );
}

/**
 * What the first stage found, shown while the questions are written (#232): only what the role analysis really holds,
 * never the questions themselves (they would spoil the practice, and the check may still change them) and never the
 * gaps (a model's judgement, discouraging just before the practice starts).
 */
function WhileYouWait({ session }: { session: InterviewSession }) {
  const role = session.roleProfile;
  if (!role) return null;
  // Must-haves first. The role lists 4 to 8 and only 6 questions are asked, so this is what the role asks for, not
  // what each question tests.
  const mustHaves = role.competencies.filter((competency) => competency.priority === "must-have");
  const others = role.competencies.filter((competency) => competency.priority !== "must-have");
  // Copied word for word from the CV: the first stage's checks reject anything else.
  const claims = (session.candidateProfile?.claimsToProbe ?? []).slice(0, claimsShown);
  return (
    <>
      <section className="space-y-2">
        <h3>What this role asks for</h3>
        <SkillRow label="Must-have" skills={mustHaves} />
        <SkillRow label="Also asked for" skills={others} />
        {/* The quote is checked word for word against the job ad. */}
        <p className="text-sm">
          Pitched at {levelName(role.roleLevel)}. The ad says: “{role.roleLevelReason.jdQuote}”
        </p>
      </section>
      {claims.length > 0 && (
        <section className="space-y-2">
          <h3>From your profile, the interviewer may ask about</h3>
          <ul className="space-y-2">
            {claims.map((claim) => (
              <li key={claim.id} className="border-l-2 border-line pl-3 [overflow-wrap:anywhere]">
                “{claim.quote}”
              </li>
            ))}
          </ul>
          <p className="text-sm text-text-muted">While you wait, recall the numbers behind these lines and what you did yourself.</p>
        </section>
      )}
    </>
  );
}

function SkillRow({ label, skills }: { label: string; skills: Competency[] }) {
  if (skills.length === 0) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <p className="w-full text-sm text-text-muted sm:w-28 sm:shrink-0">{label}</p>
      <ul aria-label={label} className="flex min-w-0 flex-1 flex-wrap gap-2">
        {skills.map((skill) => (
          <li key={skill.id} className="rounded-full border border-line px-3 py-1 text-sm [overflow-wrap:anywhere]">
            {skill.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
