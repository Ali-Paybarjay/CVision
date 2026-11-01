import { expect, test } from "@playwright/test";

// "Start again" during a practice, on a phone with mock AI (#263). Before any answer it starts again at once: there
// is nothing to lose. Once an answer is sent it asks in place first; "Keep going" keeps the answer, and only the
// "Start again" inside the question goes back to How it works.
// The first open of the page on the dev server compiles it, hence the long waits.
test.setTimeout(300_000);

test("Start again asks before an answer is lost", async ({ page }) => {
  await page.goto("/interview?job=sara-job-1");
  await page.getByRole("button", { name: "Start practice" }).click();
  await expect(page.getByText("Question 1 of 6")).toBeVisible({ timeout: 120_000 });

  // Nothing answered yet: no question.
  await page.getByRole("button", { name: "Start again" }).click();
  await expect(page.getByRole("heading", { name: "How it works" })).toBeFocused();

  await page.getByRole("button", { name: "Start practice" }).click();
  await expect(page.getByText("Question 1 of 6")).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "Use sample answer" }).click();
  await page.getByRole("button", { name: "Submit answer" }).click();
  const afterFirstAnswer = page.getByText("Your answer to the follow-up").or(page.getByText("Question 2 of 6"));
  await expect(afterFirstAnswer).toBeVisible({ timeout: 120_000 });

  const startAgain = page.getByRole("button", { name: "Start again" });
  await startAgain.click();
  const question = page.getByText("Start again with new questions?");
  await expect(question).toBeFocused();
  await expect(page.getByText("You'll lose your answer and its feedback.")).toBeVisible();

  // "Keep going": the practice is untouched and focus is back on the button.
  await page.getByRole("button", { name: "Keep going" }).click();
  await expect(question).toHaveCount(0);
  await expect(startAgain).toBeFocused();
  await expect(afterFirstAnswer).toBeVisible();

  // The trigger is replaced by the question, so the only "Start again" now is the one that confirms.
  await startAgain.click();
  await expect(question).toBeFocused();
  await page.getByRole("button", { name: "Start again" }).click();
  await expect(page.getByRole("heading", { name: "How it works" })).toBeFocused();
  await expect(page).toHaveURL(/\/interview\?job=sara-job-1$/);
});
