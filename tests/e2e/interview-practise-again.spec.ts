import { expect, test } from "@playwright/test";

// Interview practice on a phone with mock AI (#206): the report is read first, and "Practise again" sits below it.
// The first open of the page on the dev server compiles it, hence the long waits.
test.setTimeout(300_000);

test("after a practice, Practise again sits below the report and leads to How it works", async ({ page }) => {
  await page.goto("/interview?job=sara-job-1");
  await page.getByRole("button", { name: "Start practice" }).click();

  for (let n = 1; n <= 6; n++) {
    await expect(page.getByText(`Question ${n} of 6`)).toBeVisible({ timeout: 120_000 });
    await page.getByRole("button", { name: "Use sample answer" }).click();
    await page.getByRole("button", { name: "Submit answer" }).click();
    // The sample answer may get a follow-up: answer that too.
    const followUp = page.getByText("Your answer to the follow-up");
    const next = n < 6 ? page.getByText(`Question ${n + 1} of 6`) : page.getByText("Overall score");
    await expect(followUp.or(next)).toBeVisible({ timeout: 120_000 });
    if (await followUp.isVisible()) {
      await page.getByRole("button", { name: "Use sample answer" }).click();
      await page.getByRole("button", { name: "Submit answer" }).click();
    }
  }
  await expect(page.getByText("Overall score")).toBeVisible({ timeout: 120_000 });

  // No restart button above the report: the only one comes after the last answer's feedback.
  await expect(page.getByRole("button", { name: "Start again" })).toHaveCount(0);
  const again = page.getByRole("button", { name: "Practise again" });
  await expect(again).toHaveCount(1);
  const lastFeedback = await page.getByText("Do this next time").last().boundingBox();
  const button = await again.boundingBox();
  expect(button!.y).toBeGreaterThan(lastFeedback!.y);
  await expect(page.getByText("Read your feedback first. When you are ready, practise again.")).toBeVisible();

  // From the bottom of a long report, the intro must not open off screen.
  await again.click();
  const heading = page.getByRole("heading", { name: "How it works" });
  await expect(heading).toBeFocused();
  await expect(heading).toBeInViewport();
});
