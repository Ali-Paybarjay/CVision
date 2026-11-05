import { expect, test } from "@playwright/test";

// "Start again" during a practice, on a phone with mock AI (#263). With nothing to lose it starts again at once. Once
// an answer is sent, or one is being written, it asks in place first; "Keep going" or Escape keeps the work, and only
// "Start again with new questions" inside the question goes back to How it works.
// The first open of the page on the dev server compiles it, hence the long waits.
test.setTimeout(300_000);

test("Start again asks before an answer is lost", async ({ page }) => {
  await page.goto("/interview?job=sara-job-1");
  await page.getByRole("button", { name: "Start practice" }).click();
  await expect(page.getByText("Question 1 of 6")).toBeVisible({ timeout: 120_000 });

  // An answer being written but not submitted is asked about too (#269 review), and "Keep going" keeps the text.
  const answerBox = page.getByRole("textbox", { name: "Your answer" });
  await answerBox.fill("I led the move of our weekly sales report from Excel to Power BI.");
  await page.getByRole("button", { name: "Start again", exact: true }).click();
  // A group named by the question and described by what is lost takes focus, so a screen reader hears both (#281).
  const question = page.getByRole("group", { name: "Start again?" });
  await expect(question).toBeFocused();
  await expect(question).toHaveAccessibleDescription("Anything you haven't submitted will be lost.");
  await page.getByRole("button", { name: "Keep going" }).click();
  await expect(answerBox).toHaveValue("I led the move of our weekly sales report from Excel to Power BI.");

  // Nothing answered and the box empty: no question.
  await answerBox.fill("");
  await page.getByRole("button", { name: "Start again", exact: true }).click();
  await expect(page.getByRole("heading", { name: "How it works" })).toBeFocused();

  await page.getByRole("button", { name: "Start practice" }).click();
  await expect(page.getByText("Question 1 of 6")).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "Use sample answer" }).click();
  await page.getByRole("button", { name: "Submit answer" }).click();
  const afterFirstAnswer = page.getByText("Your answer to the follow-up").or(page.getByText("Question 2 of 6"));
  await expect(afterFirstAnswer).toBeVisible({ timeout: 120_000 });

  const startAgain = page.getByRole("button", { name: "Start again", exact: true });
  await startAgain.click();
  await expect(question).toBeFocused();
  await expect(question).toHaveAccessibleDescription("You'll lose your answer and its feedback.");

  // "Keep going": the practice is untouched and focus is back on the button.
  await page.getByRole("button", { name: "Keep going" }).click();
  await expect(question).toHaveCount(0);
  await expect(startAgain).toBeFocused();
  await expect(afterFirstAnswer).toBeVisible();

  // Escape is "Keep going" too (#281).
  await startAgain.click();
  await expect(question).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(question).toHaveCount(0);
  await expect(startAgain).toBeFocused();

  await startAgain.click();
  await expect(question).toBeFocused();
  await page.getByRole("button", { name: "Start again with new questions" }).click();
  await expect(page.getByRole("heading", { name: "How it works" })).toBeFocused();
  await expect(page).toHaveURL(/\/interview\?job=sara-job-1$/);
});
