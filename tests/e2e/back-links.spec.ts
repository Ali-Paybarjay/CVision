import { expect, test } from "@playwright/test";

// CV check and Interview have the same "Back" as Profile and Jobs, so a phone user is never left with only the
// browser's Back (#297). It goes back to the page before when that page is on this site.

test("CV check has Back, and it returns to the page before", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("main").getByRole("link", { name: "Check my CV in 2 minutes" }).click();
  await expect(page).toHaveURL(/\/cv-check$/);

  await page.getByRole("main").getByRole("link", { name: "Back" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("Interview has Back above the job's breadcrumb", async ({ page }) => {
  await page.goto("/interview?job=sara-job-1");
  const back = page.getByRole("main").getByRole("link", { name: "Back" });
  await expect(back).toBeVisible({ timeout: 120_000 });
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toBeVisible();
});
