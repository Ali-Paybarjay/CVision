import { expect, test } from "@playwright/test";

// On a phone, with mock AI and no accounts: a new CV over a saved profile replaces only what is read from a CV. What
// the user is looking for stays, as a CV holds none of it (#371), and an empty place to work follows the new town.
test.setTimeout(300_000);

test("a new CV keeps what the user is looking for", async ({ page }) => {
  const readAndApprove = async (cv: string) => {
    await page.getByLabel("Your CV", { exact: true }).setInputFiles(cv);
    await page.getByLabel("I agree that CVision reads my CV to build my profile.").check();
    await page.getByRole("button", { name: "Read my CV" }).click();
    await expect(page.getByRole("heading", { name: "Check your details" })).toBeVisible({ timeout: 120_000 });
    await page.getByRole("button", { name: "Approve and save" }).click();
    await expect(page.getByText("Your profile is saved.")).toBeVisible();
  };

  await page.goto("/profile");
  await readAndApprove("sample-data/cvs/sara.docx");
  await expect(page.getByText("Manchester (your town or city)")).toBeVisible();

  await page.getByRole("button", { name: "Change what you’re looking for" }).click();
  await page.getByLabel("From", { exact: true }).fill("30000");
  await page.getByLabel("Must-haves and deal-breakers (optional)").fill("No night shifts");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Your preferences are saved.")).toBeVisible();

  await page.getByRole("button", { name: "Upload a new CV" }).click();
  await expect(page.getByText("What you’re looking for stays as it is.")).toBeVisible();
  await readAndApprove("sample-data/cvs/reza.docx");

  await expect(page.getByText("At least £30,000 a year")).toBeVisible();
  await expect(page.getByText("No night shifts")).toBeVisible();
  await expect(page.getByText("London (your town or city)")).toBeVisible();
  await expect(page.getByText("Manchester (your town or city)")).toHaveCount(0);
});
