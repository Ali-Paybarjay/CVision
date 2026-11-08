import { expect, test } from "@playwright/test";

// /tailor/saved?job=<id> (#207): the CV and cover letter the user sent. The dashboard's "CV and cover letter" link opens it.
// The e2e run has no accounts, so a visitor gets a plain message to sign in, never an error.
test("the saved CV page asks a visitor to sign in, without an error", async ({ page }) => {
  await page.goto("/tailor/saved?job=sara-job-1");
  await expect(page.getByRole("heading", { level: 1, name: "The CV and cover letter you sent" })).toBeVisible();
  await expect(page.getByText("Sign in to see what you sent")).toBeVisible();
  // The app's one sign-in card (#367): create an account or sign in, and come back to this page either way.
  await expect(page.getByRole("link", { name: "I already have an account" })).toHaveAttribute("href", /\/sign-in\?next=%2Ftailor%2Fsaved/);
  await expect(page.getByRole("link", { name: "Create your account" })).toHaveAttribute("href", /\/sign-up\?next=%2Ftailor%2Fsaved/);
});
