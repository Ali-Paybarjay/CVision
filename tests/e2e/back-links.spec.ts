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

// Older browsers (iOS Safari before the Navigation API) use the app's own record of the tab's pages (#374). It starts
// on a page that is not Back's fixed link, so following that link instead of going back would fail the test.
test("without the Navigation API, Back still returns to the page before, not its fixed link", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, "navigation", { value: undefined, configurable: true }));
  await page.goto("/privacy");
  expect(await page.evaluate(() => (window as Window & { navigation?: unknown }).navigation)).toBeUndefined();

  await page.getByRole("banner").getByRole("button", { name: "Menu" }).click();
  await page.locator("#mobile-menu").getByRole("link", { name: "CV check" }).click();
  await expect(page).toHaveURL(/\/cv-check$/, { timeout: 120_000 });

  await page.getByRole("main").getByRole("link", { name: "Back" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
});

test("Interview has Back above the job's breadcrumb", async ({ page }) => {
  await page.goto("/interview?job=sara-job-1");
  const back = page.getByRole("main").getByRole("link", { name: "Back" });
  await expect(back).toBeVisible({ timeout: 120_000 });
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toBeVisible();
});
