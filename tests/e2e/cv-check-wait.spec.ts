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

// Pilot, 7 Nov (#333): the check found the problems but she didn't know Tailor fixes them, so the card under the result
// says what happens after the button.
test("the card under the result says Tailor makes these fixes, and leads to it", async ({ page }) => {
  await page.goto("/cv-check");
  await page.getByLabel("Your CV", { exact: true }).setInputFiles("sample-data/cvs/sara.docx");
  await page.getByRole("button", { name: "Check my CV" }).click();
  await expect(page.getByRole("button", { name: "Check another CV" })).toBeVisible({ timeout: 120_000 });

  const card = page.getByRole("heading", { name: "Next: make it fit each job" }).locator("..");
  await expect(card).toContainText("Want CVision to make these fixes for you?");
  await expect(card).toContainText("Tailor asks about anything missing, rewrites your CV for a job and lets you approve every change.");
  await expect(card.getByRole("link", { name: "Tailor my CV to a job" })).toBeVisible();
});
