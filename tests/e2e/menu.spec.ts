import { expect, test } from "@playwright/test";

// The open menu on a phone sits above everything on the page, so a tap on one of its links reaches that link (#298).
// Tailor's five steps are positioned (`relative`), and once drew over the menu, under "Jobs" and "Tailor".

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

  await menu.getByRole("link", { name: "Jobs" }).click();
  await expect(page).toHaveURL(/\/jobs$/);
});
