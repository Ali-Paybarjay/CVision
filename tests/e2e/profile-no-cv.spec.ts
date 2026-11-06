import { expect, test } from "@playwright/test";

// Someone with no CV sees their way in on the first screen of a phone, under "Upload your CV", instead of only in the
// card at the end of the page (#204). Both ways in are "Fill in my details" and open the same form.

test("on a phone, Fill in my details is on the first screen and opens the form to type a profile in", async ({ page }) => {
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Upload your CV" })).toBeVisible();

  const fillIn = page.getByRole("main").getByRole("button", { name: "Fill in my details" });
  await expect(fillIn).toHaveCount(2);
  await expect(fillIn.first()).toBeInViewport();

  await fillIn.first().click();
  await expect(page.getByRole("heading", { name: "Add your details" })).toBeVisible();
});
