import { expect, test } from "@playwright/test";

// Interview practice on a phone with mock AI (#232): the intro says how long the start takes, and "Preparing your
// interview" counts down and says to keep the page open until the first question.
// The first open of the page on the dev server compiles it, hence the long waits.
test.setTimeout(300_000);

test("Preparing your interview says how long it takes, then gives way to the first question", async ({ page }) => {
  await page.goto("/interview?job=sara-job-1");
  await expect(page.getByText("Getting them ready takes about 90 seconds.")).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "Start practice" }).click();

  const preparing = page.getByRole("heading", { name: "Preparing your interview" });
  await expect(preparing).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText(/^(About \d+ seconds left|Almost ready)$/)).toBeVisible();
  await expect(page.getByText("Keep this page open.")).toBeVisible();

  await expect(page.getByText("Question 1 of 6")).toBeVisible({ timeout: 120_000 });
  await expect(preparing).toHaveCount(0);
  await expect(page.getByText(/^Questions ready in [\d.]+ seconds\.$/)).toBeVisible();
});
