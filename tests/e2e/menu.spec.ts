import { expect, test } from "@playwright/test";

// The open menu on a phone sits above everything on the page, so a tap on one of its links reaches that link (#298).
// Tailor's five steps are positioned (`relative`), and once drew over the menu, under "Check a job" and "Tailor".

test("on a phone the open menu covers Tailor's steps, and its links take the tap", async ({ page }) => {
  await page.goto("/tailor?job=sara-job-1");
  await expect(page.getByRole("button", { name: /^3\. Review your tailored CV/ })).toBeVisible();

  await page.getByRole("banner").getByRole("button", { name: "Menu" }).click();
  const menu = page.locator("#mobile-menu");
  await expect(menu).toBeVisible();

  // Nothing from the page is drawn over any of the menu's links.
  for (const link of await menu.getByRole("link").all()) {
    const onTop = await link.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return top !== null && element.contains(top);
    });
    expect(onTop, `${await link.textContent()} is on top`).toBe(true);
  }

  await menu.getByRole("link", { name: "Check a job" }).click();
  await expect(page).toHaveURL(/\/jobs$/);
});

// The open menu closes on a new page, on Escape and on a tap outside it, so it never covers the top of the next page
// (#302). The header stays in the layout from page to page, and the logo and the header button once left it open.

test("on a phone the header button and the logo close the open menu on the next page", async ({ page }) => {
  const header = page.getByRole("banner");
  const menuButton = header.getByRole("button", { name: "Menu" });
  const menu = page.locator("#mobile-menu");

  await page.goto("/tailor?job=sara-job-1");
  await menuButton.click();
  await expect(menu).toBeVisible();
  await header.getByRole("link", { name: "Tailor my CV to a job" }).click();
  await expect(page).toHaveURL(/\/sign-up$/);
  await expect(menu).toBeHidden();

  await menuButton.click();
  await expect(menu).toBeVisible();
  await header.getByRole("link", { name: "CVision home" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(menu).toBeHidden();

  // On the home page itself the logo goes nowhere new, and the tap outside the menu closes it.
  await menuButton.click();
  await expect(menu).toBeVisible();
  await header.getByRole("link", { name: "CVision home" }).click();
  await expect(menu).toBeHidden();
});

test("on a phone Escape and a tap outside close the open menu, and the tap still reaches the page", async ({ page }) => {
  const menuButton = page.getByRole("banner").getByRole("button", { name: "Menu" });
  const menu = page.locator("#mobile-menu");
  await page.goto("/tailor?job=sara-job-1");

  // Escape from a link inside the menu closes it and gives focus back to the Menu button.
  await menuButton.click();
  await menu.getByRole("link", { name: "Check a job" }).focus();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(menuButton).toBeFocused();
  await expect(menuButton).toHaveAttribute("aria-expanded", "false");

  // A tap on Tailor's fourth step, below the menu, closes the menu and still opens or closes that step.
  const step = page.getByRole("button", { name: /^4\. Cover letter/ });
  const expandedBefore = await step.getAttribute("aria-expanded");
  await menuButton.click();
  await expect(menu).toBeVisible();
  await step.click();
  await expect(menu).toBeHidden();
  await expect(step).toHaveAttribute("aria-expanded", expandedBefore === "true" ? "false" : "true");
});
