import { expect, test } from "@playwright/test";

// Someone with no CV sees their way in on the first screen of a phone, under "Upload your CV" (#204). It is the page's
// only "Fill in my details": the card at the end of the page that said it again is gone (#504).

test("on a phone, Fill in my details is on the first screen and opens the form to type a profile in", async ({ page }) => {
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Upload your CV" })).toBeVisible();

  const fillIn = page.getByRole("main").getByRole("button", { name: "Fill in my details" });
  await expect(fillIn).toHaveCount(1);
  await expect(fillIn).toBeInViewport();

  await fillIn.click();
  await expect(page.getByRole("heading", { name: "Add your details" })).toBeVisible();
});
