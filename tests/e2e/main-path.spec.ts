import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

// The brand's three steps on a phone, as a new visitor: mock AI, sample data and no accounts
// (playwright.config.ts). A step that is not built yet is test.fixme, named with the card that builds it;
// when that card lands, its owner tells Ali and the fixme becomes a real test.

type SampleJob = { id: string; title: string; company: string; description: string };

/** A persona's sample jobs, with each ad as it would be pasted (sample-data/personas/<name>/jobs.json). */
function sampleJobs(persona: string): SampleJob[] {
  return JSON.parse(readFileSync(`sample-data/personas/${persona}/jobs.json`, "utf8")) as SampleJob[];
}

test("the home page says what CVision does and leads to Get started free", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Every application, made to fit." })).toBeVisible();

  await page.getByRole("main").getByRole("link", { name: "Get started free" }).click();

  await expect(page).toHaveURL(/\/sign-up$/);
  await expect(page.getByRole("heading", { level: 1, name: "Create your free account" })).toBeVisible();
});

test("step 1: upload a CV, check the details and save the Profile", async ({ page }) => {
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Upload your CV" })).toBeVisible();

  await page.getByLabel("Your CV", { exact: true }).setInputFiles("sample-data/cvs/sara.docx");
  await page.getByLabel("I agree that CVision reads my CV to build my profile.").check();
  await page.getByRole("button", { name: "Read my CV" }).click();

  await expect(page.getByRole("heading", { name: "Check your details" })).toBeVisible();
  await expect(page.getByText("Demo mode: this is Sara Khan’s sample profile, not your CV")).toBeVisible();

  // Nothing is saved until the user approves: one button at the end of the page checks every item and saves.
  await page.getByRole("button", { name: "Approve and save" }).click();

  await expect(page.getByText("Your profile is saved.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Sara Khan" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Paste a job ad" })).toHaveAttribute("href", "/jobs");
});

test("step 2: paste a job ad, see the match and go on to tailoring", async ({ page }) => {
  // In the demo the ad is read as the sample job it names, and a visitor with no profile yet is matched
  // as that job's sample person: Sara Khan and her first job.
  const [job] = sampleJobs("sara");

  await page.goto("/jobs");
  await page.getByLabel("The job ad", { exact: true }).fill(job.description);
  await page.getByRole("button", { name: "Check my fit" }).click();

  await expect(page.getByRole("heading", { level: 2, name: job.title })).toBeVisible();
  await expect(page.getByText(job.company, { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Tailor my CV for this job" })).toHaveAttribute(
    "href",
    `/tailor?job=${job.id}`,
  );
});

test("step 3, for now: approve a suggested change on the sample job", async ({ page }) => {
  // Until Jobs hands over a real job, /tailor works on Sara's sample jobs (Nazanin, #49): it asks which job,
  // suggests changes from the CV straight away, then asks a one-tap question per gap (#191).
  await page.goto("/tailor");
  await expect(page.getByRole("heading", { name: "Which job is this CV for?" })).toBeVisible();
  await page.getByRole("link", { name: "Junior Data Analyst at Pennine Health Analytics" }).click();

  await expect(page).toHaveURL(/\/tailor\?job=sara-job-1$/);
  await expect(page.getByText("Sample data · mock mode")).toBeVisible();

  // Suggestions from the CV come without any question, and wait for the user: nothing goes in until they approve.
  const fromCv = page.getByRole("region", { name: "Suggestions from your CV" });
  const tailoredLines = page.getByRole("complementary", { name: "Your CV for this job" }).getByText("(tailored for this job)");
  const approveFromCv = fromCv.getByRole("button", { name: "Approve", exact: true });
  await expect(approveFromCv.first()).toBeVisible();
  await expect(tailoredLines).toHaveCount(0);
  await approveFromCv.first().click();
  await expect(approveFromCv.first()).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("✓ Approved: 1")).toBeVisible();
  await expect(tailoredLines).toHaveCount(1);

  // A gap is answered with one tap; there is no box to fill in.
  const gap = page
    .getByRole("region", { name: "What the job asks for that your CV does not show" })
    .getByRole("article")
    .filter({ hasText: "Clear communication with non-technical stakeholders" });
  await gap.getByRole("button", { name: "Yes, at work" }).click();
  const approveGap = gap.getByRole("button", { name: "Approve", exact: true });
  await expect(approveGap.first()).toBeVisible();
  await approveGap.first().click();
  await expect(page.getByText("✓ Approved: 2")).toBeVisible();
  await expect(tailoredLines).toHaveCount(2);
});

test.fixme("step 3: get the tailored CV for the pasted job, with each change marked (#49)", async ({ page }) => {
  // Starts where step 2 ends: its "Tailor my CV for this job" link to the job just pasted, not a sample persona.
  await page.goto("/tailor?job=sara-job-1");
  await expect(page.getByRole("heading", { name: /tailored CV/i })).toBeVisible();
});
