import { expect, test, type Page } from "@playwright/test";

// "Preparing your interview" on a phone with mock AI (#232). Mock steps answer at once, so the card would be gone
// before it could be read: the tests hold the start-up steps and let them go one at a time.
// The first open of the page on the dev server compiles it, hence the long waits.
test.setTimeout(300_000);

const startupSteps = new Set(["analyse", "generate", "review"]);

/** Holds each start-up step until `release(step)` lets it through. */
async function holdStartupSteps(page: Page) {
  const held = new Map<string, () => void>();
  await page.route("**/interview/api", async (route) => {
    const step = route.request().postDataJSON()?.step;
    if (startupSteps.has(step)) await new Promise<void>((release) => held.set(step, release));
    await route.continue();
  });
  return async (step: string) => {
    await expect.poll(() => held.has(step), { timeout: 120_000 }).toBe(true);
    held.get(step)!();
  };
}

test("says how long it takes, shows each stage and what it found, and keeps Start again for when it is needed", async ({ page }) => {
  const release = await holdStartupSteps(page);
  await page.goto("/interview?job=sara-job-1");
  await expect(page.getByText("Getting them ready takes about 2 minutes.")).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "Start practice" }).click();

  const preparing = page.getByRole("heading", { name: "Preparing your interview" });
  await expect(preparing).toBeVisible();
  // "Start practice" is gone, so focus moves to the card rather than to nothing.
  await expect(preparing).toBeFocused();
  await expect(page.getByText("About 2 minutes left")).toBeVisible();
  await expect(page.getByText("Working…", { exact: true })).toBeVisible();
  await expect(page.getByText("Waiting", { exact: true })).toHaveCount(2);
  await expect(page.getByText("Each answer is scored on technical accuracy, depth of reasoning, applied evidence and clarity.")).toBeVisible();
  await expect(page.getByText("Keep this page open. You can use another tab while you wait.")).toBeVisible();
  // A start that is going fine cannot be thrown away by mistake.
  await expect(page.getByRole("button", { name: "Start again" })).toHaveCount(0);

  await release("analyse");
  // The dev server compiles the API on its first request.
  await expect(page.getByRole("heading", { name: "What this role asks for" })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText("Pitched at junior level. The ad says: “We are looking for a Junior Data Analyst”")).toBeVisible();
  await expect(page.getByRole("heading", { name: "From your profile, the interviewer may ask about" })).toBeVisible();
  await expect(page.getByText("“Automated a weekly stock report, cutting preparation time from 4 hours to 30 minutes”")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Done:" })).toHaveText("Done: Reading the role and your profile.");
  await expect(page.getByRole("button", { name: "Start again" })).toHaveCount(0);

  await release("generate");
  await expect(page.getByRole("status").filter({ hasText: "Done:" })).toHaveText("Done: Writing 6 questions for this job.", { timeout: 120_000 });
  await release("review");

  const firstQuestion = page.getByText("Question 1 of 6");
  await expect(firstQuestion).toBeVisible({ timeout: 120_000 });
  await expect(preparing).toHaveCount(0);
  // Question 1's line takes focus, not the answer box, which would open the keyboard on a phone.
  await expect(firstQuestion).toBeFocused();
  // The card is gone, but a screen reader still hears that the questions are ready.
  await expect(page.getByRole("status").filter({ hasText: "questions are ready" })).toHaveText("Your 6 questions are ready. Question 1 is below.");
  await expect(page.getByRole("button", { name: "Start again" })).toBeVisible();
  // How long the start took is for the lab only (#243).
  await expect(page.getByText(/Questions ready in/)).toHaveCount(0);
  await expect(page.getByText(/^0 words · aim for \d+ to \d+ words$/)).toBeVisible();
});

test("a stage that does not finish is tried once more, then says so plainly, keeps what is done and offers Try again", async ({ page }) => {
  // The second step fails twice: the first time the page tries again by itself, the second time it is the user's call.
  let generateCalls = 0;
  const secondTry: { release?: () => void } = {};
  await page.route("**/interview/api", async (route) => {
    if (route.request().postDataJSON()?.step === "generate") {
      generateCalls += 1;
      if (generateCalls === 2) await new Promise<void>((release) => (secondTry.release = release));
      if (generateCalls <= 2) return route.fulfill({ status: 503, contentType: "text/html", body: "<html>Service Unavailable</html>" });
    }
    return route.continue();
  });

  await page.goto("/interview?job=sara-job-1");
  await page.getByRole("button", { name: "Start practice" }).click({ timeout: 120_000 });

  // The first failure: the page says it is trying again, and there is nothing for the user to do.
  await expect(page.getByText("Trying again…", { exact: true })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText("That step did not finish, so we are running it once more.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start again" })).toHaveCount(0);
  // The second go is sent after a short pause.
  await expect.poll(() => secondTry.release !== undefined, { timeout: 30_000 }).toBe(true);
  secondTry.release!();

  // The second failure: plain words, no status code, what is kept, Try again, and Start again back as the other way out.
  await expect(page.getByText("Failed", { exact: true })).toBeVisible();
  await expect(page.getByText("Something went wrong on our side. Try again in a moment.", { exact: true })).toBeVisible();
  await expect(page.getByText("503")).toHaveCount(0);
  await expect(page.getByText("The steps already done are kept.")).toBeVisible();
  await expect(page.getByText(/(seconds|minutes) left/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start again" })).toBeVisible();
  expect(generateCalls).toBe(2);

  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Question 1 of 6")).toBeVisible({ timeout: 120_000 });
  expect(generateCalls).toBe(3);
});
