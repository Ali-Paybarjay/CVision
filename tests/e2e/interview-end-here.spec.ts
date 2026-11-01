import { expect, test } from "@playwright/test";

// "End here" in interview practice (#205), on a phone with mock AI: end after one answer, or before any.
// The first open of the page on the dev server compiles it, hence the long waits.
test.setTimeout(300_000);

test("ending after one answer scores it and suggests answers for the other five", async ({ page }) => {
  await page.goto("/interview?job=sara-job-1");
  await page.getByRole("button", { name: "Start practice" }).click();
  await expect(page.getByText("Question 1 of 6")).toBeVisible({ timeout: 120_000 });

  await page.getByRole("button", { name: "Use sample answer" }).click();
  await page.getByRole("button", { name: "Submit answer" }).click();
  // The sample answer may get a follow-up: answer that too, then wait for question 2.
  const followUp = page.getByText("Your answer to the follow-up");
  const second = page.getByText("Question 2 of 6");
  await expect(followUp.or(second)).toBeVisible({ timeout: 120_000 });
  if (await followUp.isVisible()) {
    await page.getByRole("button", { name: "Use sample answer" }).click();
    await page.getByRole("button", { name: "Submit answer" }).click();
  }
  await expect(second).toBeVisible({ timeout: 120_000 });

  await page.getByRole("button", { name: "End here and see suggested answers" }).click();
  await expect(page.getByText("You've answered 1 of 6 questions.")).toBeVisible();
  await page.getByRole("button", { name: "End practice" }).click();

  await expect(page.getByText("Based on the 1 of 6 questions you answered")).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText("Not answered", { exact: true })).toHaveCount(5);
  await expect(page.getByText("Do this next time")).toHaveCount(1);
  await page.getByText("Read a suggested answer").first().click();
});

test("ending at the first question gives a suggested answer for every question and no score", async ({ page }) => {
  await page.goto("/interview?job=sara-job-1");
  await page.getByRole("button", { name: "Start practice" }).click();
  await expect(page.getByText("Question 1 of 6")).toBeVisible({ timeout: 120_000 });

  await expect(page.getByText("Short on time? Stop now and get a suggested answer", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "End here and see suggested answers" }).click();
  await expect(page.getByText("Each of the 6 questions gets a suggested answer built from your profile.")).toBeVisible();
  await page.getByRole("button", { name: "End practice" }).click();

  await expect(page.getByText("there is no score", { exact: false })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByRole("heading", { name: "From your profile", exact: true })).toBeVisible();
  await expect(page.getByText("Not answered", { exact: true })).toHaveCount(6);

  // A reload shows the same report.
  await page.reload();
  await expect(page.getByText("Not answered", { exact: true })).toHaveCount(6, { timeout: 120_000 });
});
