import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

// LinkedIn Experience lines on a phone, as a new visitor: mock AI, sample data and no accounts
// (playwright.config.ts). Every line is one of Sara Khan's own CV lines, word for word.

type SampleJob = { id: string; title: string; company: string; description: string };

test("from the match, shows each role's own CV lines to add on LinkedIn, and keeps the gaps out of them", async ({ page }) => {
  const [job] = JSON.parse(readFileSync("sample-data/personas/sara/jobs.json", "utf8")) as SampleJob[];

  await page.goto("/jobs");
  await page.getByLabel("The job ad", { exact: true }).fill(job.description);
  await page.getByRole("button", { name: "Check my fit" }).click();
  await page.getByRole("link", { name: "Suggest LinkedIn lines for this job" }).click();

  await expect(page).toHaveURL(new RegExp(`/jobs/linkedin\\?job=${job.id}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Your LinkedIn Experience" })).toBeVisible();
  await expect(page.getByText("This uses Sara Khan’s sample CV, not yours")).toBeVisible();

  // Nothing is asked of the AI until the user presses the button. Pressed before the page's script has loaded, it
  // does nothing, so press it again while it is still there, until the lines show.
  const lines = page.getByRole("heading", { level: 2, name: "Your LinkedIn lines" });
  await expect(async () => {
    const button = page.getByRole("button", { name: "Suggest my LinkedIn lines" });
    if (await button.isVisible()) await button.click({ timeout: 1_000 });
    await expect(lines).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
  await expect(lines).toBeFocused();

  // The title, company and dates come from the CV; "Intern" goes to LinkedIn's Employment type.
  const role = page.getByRole("article", { name: "Data Analyst Intern" });
  await expect(role).toContainText("Northgate Retail Insights");
  await expect(role).toContainText("Internship");
  await expect(role.getByRole("listitem")).toHaveText([
    "Cleaned and joined weekly sales data from 120 stores using SQL and Python",
    "Built Tableau dashboards for the regional sales team",
  ]);
  await expect(role.getByRole("button", { name: "Copy the lines for Data Analyst Intern at Northgate Retail Insights" })).toBeVisible();

  // What the ad asks for and the CV doesn't show is listed apart, never in a line.
  const gaps = page.getByRole("region", { name: "What the CV doesn’t show yet" });
  await expect(gaps).toContainText("Power BI");
  await expect(role).not.toContainText("Power BI");
});
