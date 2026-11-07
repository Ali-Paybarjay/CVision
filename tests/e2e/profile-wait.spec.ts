import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

// The CV upload and the job check on a phone, with mock AI (issue #235): the Privacy link opens in a new tab, and a
// wait says on screen what is happening, and again once it has run for a minute. Mock AI answers at once, so each test
// holds the request to see the wait, and moves the clock on a minute instead of waiting one.
test.setTimeout(300_000);

test("the Privacy link opens in a new tab, and a long read says so after a minute", async ({ page }) => {
  await page.clock.install();
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  let reading = false;
  await page.route("**/profile/extract", async (route) => {
    reading = true;
    await held;
    await route.continue();
  });

  await page.goto("/profile");
  await page.getByLabel("Your CV", { exact: true }).setInputFiles("sample-data/cvs/sara.docx");
  await page.getByLabel("I agree that CVision reads my CV to build my profile.").check();
  await expect(page.getByRole("link", { name: "Privacy page (opens in a new tab)" })).toHaveAttribute("target", "_blank");

  await page.getByRole("button", { name: "Read my CV" }).click();
  await expect.poll(() => reading, { timeout: 120_000 }).toBe(true);
  await expect(page.getByText("Reading your CV. This can take up to a minute. Keep this page open.")).toBeVisible();

  await page.clock.fastForward("01:01");
  await expect(
    page.getByText("Still reading your CV. A long one can take up to 2 minutes. Keep this page open."),
  ).toBeVisible();

  release();
  await expect(page.getByRole("heading", { name: "Check your details" })).toBeVisible({ timeout: 120_000 });
});

test("the job check says on screen that it is running, and again after a minute", async ({ page }) => {
  // In the demo the ad is read as the sample job it names (sample-data/personas/sara/jobs.json).
  const [job] = JSON.parse(readFileSync("sample-data/personas/sara/jobs.json", "utf8")) as {
    title: string;
    description: string;
  }[];
  await page.clock.install();
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  let checking = false;
  // The check is a server action: a POST to the page itself.
  await page.route("**/jobs", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    checking = true;
    await held;
    await route.continue();
  });

  await page.goto("/jobs");
  // The link comes first (#330); a pasted ad is the other choice.
  await page.getByRole("radio", { name: "Paste the text" }).check();
  await page.getByLabel("The job ad", { exact: true }).fill(job.description);
  await page.getByRole("button", { name: "Check my fit" }).click();
  await expect.poll(() => checking, { timeout: 120_000 }).toBe(true);
  await expect(
    page.getByText("Reading the ad and checking your fit. This can take up to a minute. Keep this page open."),
  ).toBeVisible();

  await page.clock.fastForward("01:01");
  await expect(
    page.getByText("Still checking your fit. A long ad can take up to 2 minutes. Keep this page open."),
  ).toBeVisible();

  release();
  await expect(page.getByRole("heading", { level: 2, name: job.title })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText("Still checking your fit.", { exact: false })).toHaveCount(0);
});
