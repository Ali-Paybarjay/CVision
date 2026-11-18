import { expect, test } from "@playwright/test";

// "Skip this question" in interview practice (#530), on a phone with mock AI: Skip moves on with no answer, asks first
// when an answer is half written, and skipping the last question ends the practice with "Skipped" and no score.
// The first open of the page on the dev server compiles it, hence the long waits.
test.setTimeout(300_000);

test("skipping moves on with no answer, and skipping the last question ends the practice", async ({ page }) => {
  await page.goto("/interview?job=sara-job-1");
  await page.getByRole("button", { name: "Start practice" }).click();
  await expect(page.getByText("Question 1 of 6")).toBeVisible({ timeout: 120_000 });

  const skip = page.getByRole("button", { name: "Skip this question" });
  const list = page.getByRole("region", { name: "Your interview" });
  await skip.click();
  await expect(page.getByText("Question 2 of 6")).toBeVisible();
  await expect(list.getByText("0 of 6 answered")).toBeVisible();
  await expect(list.getByText("Skipped", { exact: true })).toHaveCount(1);

  // With an answer half written, Skip asks first, and Escape goes back to the button.
  await page.getByRole("textbox", { name: "Your answer", exact: true }).fill("I would start by checking");
  await skip.click();
  const question = page.getByRole("group", { name: "Skip this question?" });
  await expect(question).toBeFocused();
  await expect(question).toHaveAccessibleDescription(/What you've typed won't be saved\./);
  await page.keyboard.press("Escape");
  await expect(question).toHaveCount(0);
  await expect(skip).toBeFocused();
  await skip.click();
  await question.getByRole("button", { name: "Skip this question" }).click();

  for (let n = 3; n <= 6; n++) {
    await expect(page.getByText(`Question ${n} of 6`)).toBeVisible();
    await skip.click();
  }

  await expect(page.getByText("No question was answered, so there is no score.", { exact: false })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText("Skipped", { exact: true })).toHaveCount(6);
  await expect(page.getByText("Not answered", { exact: true })).toHaveCount(0);
});
