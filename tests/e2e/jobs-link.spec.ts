import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

// Jobs on a phone (#330): the ad's link comes first, and when a site won't show its ads to other websites the page
// asks for the ad's text, keeping the link for Apply. LinkedIn is never opened, so this needs no network.
// The first open of the page on the dev server compiles it, hence the long waits.
test.setTimeout(300_000);

// In the demo the ad is read as the sample job it names (sample-data/personas/sara/jobs.json).
const [job] = JSON.parse(readFileSync("sample-data/personas/sara/jobs.json", "utf8")) as { title: string; description: string }[];
const linkedIn = "https://uk.linkedin.com/jobs/view/4012345678";

test("asks for the link first, then for the ad's text when the site won't show it to us", async ({ page }) => {
  await page.goto("/jobs");
  await expect(page.getByRole("radio", { name: "Paste the link" })).toBeChecked();
  await expect(page.getByLabel("The job ad", { exact: true })).toHaveCount(0);

  await page.getByLabel("Link to the ad", { exact: true }).fill(linkedIn);
  await page.getByRole("button", { name: "Get the ad" }).click();
  await expect(
    page.getByText("LinkedIn doesn’t let other websites open its job ads. Copy the ad from the page and paste it below."),
  ).toBeVisible({ timeout: 120_000 });

  await page.getByLabel("The job ad", { exact: true }).fill(job.description);
  await page.getByRole("button", { name: "Check my fit" }).click();
  await expect(page.getByRole("heading", { level: 2, name: job.title })).toBeVisible({ timeout: 120_000 });
  // The link stays with the job, so the ad can be opened when the user applies.
  await expect(page.getByRole("link", { name: /^Open the original ad/ })).toHaveAttribute("href", linkedIn);

  // The page has no Back: "Check another job" starts again from an empty link.
  await expect(page.getByRole("main").getByRole("button", { name: "Back", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Check another job" }).click();
  await expect(page.getByRole("radio", { name: "Paste the link" })).toBeChecked();
  await expect(page.getByLabel("Link to the ad", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("The job ad", { exact: true })).toHaveCount(0);

  // A new link hides the ad pasted for the old one, and when the new link can't be read either, the box comes back
  // empty, not with the old job's ad, which would go to the check with the new job's link.
  await page.getByLabel("Link to the ad", { exact: true }).fill(linkedIn);
  await page.getByRole("button", { name: "Get the ad" }).click();
  await page.getByLabel("The job ad", { exact: true }).fill(job.description);
  await page.getByLabel("Link to the ad", { exact: true }).fill("https://uk.indeed.com/viewjob?jk=0123456789abcdef");
  await expect(page.getByLabel("The job ad", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Get the ad" }).click();
  await expect(page.getByText("Indeed doesn’t let other websites open its job ads.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("The job ad", { exact: true })).toHaveValue("");
});

test("checks the link before opening anything, and Enter gets the ad", async ({ page }) => {
  await page.goto("/jobs");
  await page.getByRole("button", { name: "Get the ad" }).click();
  await expect(page.getByText("Paste the link to the ad first.")).toBeVisible({ timeout: 120_000 });

  await page.getByLabel("Link to the ad", { exact: true }).fill("not a link");
  await page.getByLabel("Link to the ad", { exact: true }).press("Enter");
  await expect(page.getByText("Enter the full link to the ad, starting with https://")).toBeVisible();
  await expect(page.getByLabel("The job ad", { exact: true })).toHaveCount(0);
});
