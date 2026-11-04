import { expect, test } from "@playwright/test";

// The free CV check on a phone, with mock AI (issue #235: a wait with nothing on screen looks like nothing is happening).
// Mock checking answers at once, so the test holds the request to see the wait.
// The first open of the page on the dev server compiles it, hence the long waits.
test.setTimeout(300_000);

test("says on screen that the CV is being checked, and how long it can take", async ({ page }) => {
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  let checking = false;
  await page.route("**/cv-check/api", async (route) => {
    checking = true;
    await held;
    await route.continue();
  });

  await page.goto("/cv-check");
  await page.getByLabel("Your CV", { exact: true }).setInputFiles("sample-data/cvs/sara.docx");
  await page.getByRole("button", { name: "Check my CV" }).click();
  await expect.poll(() => checking, { timeout: 120_000 }).toBe(true);

  await expect(page.getByRole("button", { name: "Checking your CV…" })).toBeDisabled();
  await expect(page.getByText("Checking your CV. This can take up to a minute. Keep this page open.")).toBeVisible();

  release();
  await expect(page.getByRole("button", { name: "Check another CV" })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText("Checking your CV. This can take up to a minute.")).toHaveCount(0);
});
