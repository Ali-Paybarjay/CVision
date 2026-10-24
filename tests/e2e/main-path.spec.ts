import { expect, test } from "@playwright/test";

// The brand's three steps on a phone, as a new visitor: mock AI, sample data and no accounts
// (playwright.config.ts). A step that is not built yet is test.fixme, named with the card that builds it;
// when that card lands, its owner tells Ali and the fixme becomes a real test.

test("the home page says what CVision does and leads to Get started free", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Every application, made to fit." })).toBeVisible();

  await page.getByRole("main").getByRole("link", { name: "Get started free" }).click();

  await expect(page).toHaveURL(/\/sign-up$/);
  await expect(page.getByRole("heading", { level: 1, name: "Create your free account" })).toBeVisible();
});

test("step 1: upload a CV, check every detail and save the Profile", async ({ page }) => {
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Upload your CV" })).toBeVisible();

  await page.getByLabel("Your CV", { exact: true }).setInputFiles("sample-data/cvs/sara.docx");
  await page.getByLabel("I agree that CVision reads my CV to build my profile.").check();
  await page.getByRole("button", { name: "Read my CV" }).click();

  await expect(page.getByRole("heading", { name: "Check your details" })).toBeVisible();
  await expect(page.getByText("Demo mode: this is Sara Khan’s sample profile, not your CV")).toBeVisible();

  // Nothing is saved until every item is approved, so approve them one by one, as a user would.
  const approve = page.getByRole("button", { name: /^Approve / });
  const items = await approve.count();
  expect(items).toBeGreaterThan(0);
  for (let left = items; left > 0; left--) {
    await approve.first().click();
    await expect(approve).toHaveCount(left - 1);
  }
  await expect(page.getByText(`${items} of ${items} items approved`)).toBeVisible();
  await page.getByRole("button", { name: "Save my profile" }).click();

  await expect(page.getByRole("heading", { name: "Add the detail employers look for" })).toBeVisible();
  await page.getByRole("button", { name: "Skip for now" }).click();

  await expect(page.getByText("Your profile is saved.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Sara Khan" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Paste a job ad" })).toHaveAttribute("href", "/jobs");
});

test.fixme("step 2: paste a job ad and see the match (#46)", async ({ page }) => {
  // The labels below are placeholders: write the real ones when Shayan's Jobs page lands.
  await page.goto("/jobs");
  await page.getByLabel("Job ad").fill("Junior Data Analyst at Pennine Health Analytics, Manchester.");
  await page.getByRole("button", { name: "Check my match" }).click();
  await expect(page.getByRole("heading", { name: /match/i })).toBeVisible();
});

test("step 3, for now: approve a suggested change on the sample job", async ({ page }) => {
  // Until Jobs hands over a real job, /tailor works on Sara's sample jobs (Nazanin, #49): it asks which job,
  // then asks a question per gap, with the sample answer already filled in.
  await page.goto("/tailor");
  await expect(page.getByRole("heading", { name: "Which job is this CV for?" })).toBeVisible();
  await page.getByRole("link", { name: "Junior Data Analyst at Pennine Health Analytics" }).click();

  await expect(page).toHaveURL(/\/tailor\?job=sara-job-1$/);
  await expect(page.getByText("Sample data · mock mode")).toBeVisible();

  const gap = page
    .getByRole("region", { name: "Questions about your experience" })
    .getByRole("article")
    .filter({ hasText: "Clear communication with non-technical stakeholders" });
  await expect(gap.getByLabel("Your answer")).not.toHaveValue("");
  await gap.getByRole("button", { name: "Suggest a change" }).click();

  // The suggestion waits for the user: nothing goes into the CV until they approve it.
  const approve = gap.getByRole("button", { name: "Approve", exact: true });
  const tailoredLines = page.getByRole("complementary", { name: "Your CV for this job" }).getByText("(tailored for this job)");
  await expect(approve.first()).toBeVisible();
  await expect(tailoredLines).toHaveCount(0);
  await approve.first().click();

  await expect(approve.first()).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("✓ Approved: 1")).toBeVisible();
  await expect(tailoredLines).toHaveCount(1);
});

test.fixme("step 3: get the tailored CV for the pasted job, with each change marked (#49)", async ({ page }) => {
  // Starts where step 2 ends: the job just pasted, not a sample persona.
  await page.goto("/tailor");
  await expect(page.getByRole("heading", { name: /tailored CV/i })).toBeVisible();
});
