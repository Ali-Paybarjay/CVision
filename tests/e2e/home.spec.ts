import { expect, type Locator, test } from "@playwright/test";

// The home page's calls to action (#177): one action has one name, and the header's "Tailor my CV to a job"
// stays on one line next to the logo and the menu button on a phone, in light and dark.

/** How many lines of text an element's label takes up. */
function lineCount(locator: Locator) {
  return locator.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
  });
}

const phones = [
  { width: 390, colorScheme: "light" },
  { width: 390, colorScheme: "dark" },
  { width: 360, colorScheme: "light" },
] as const;

for (const { width, colorScheme } of phones) {
  test(`the header button fits on one line on a ${width}px phone (${colorScheme})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ colorScheme });
    await page.goto("/");

    const header = page.getByRole("banner");
    const logo = header.getByRole("link", { name: "CVision home" });
    const cta = header.getByRole("link", { name: "Tailor my CV to a job" });
    const menu = header.getByRole("button", { name: "Menu" });
    await expect(cta).toBeVisible();

    const [logoBox, ctaBox, menuBox] = await Promise.all([logo.boundingBox(), cta.boundingBox(), menu.boundingBox()]);
    if (!logoBox || !ctaBox || !menuBox) throw new Error("The logo, the header button and the menu button are all shown.");

    expect(await lineCount(cta)).toBe(1);
    expect(ctaBox.height).toBe(44);
    expect(ctaBox.x).toBeGreaterThan(logoBox.x + logoBox.width);
    expect(menuBox.x).toBeGreaterThan(ctaBox.x + ctaBox.width);
    expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(width - 16 + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}

test("the header keeps every link on one line on a tablet and a laptop", async ({ page }) => {
  for (const width of [768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const header = page.getByRole("banner");
    await expect(header.getByRole("link", { name: "Tailor my CV to a job" })).toBeVisible();

    for (const link of await header.getByRole("link").all()) {
      if (await link.isVisible()) expect(await lineCount(link), `${await link.textContent()} at ${width}px`).toBe(1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});

test("each hero button says what you get, with Free only in the small line under it", async ({ page }) => {
  await page.goto("/");
  const main = page.getByRole("main");

  const tailor = main.getByRole("link", { name: "Tailor my CV to a job" });
  await expect(tailor).toHaveAccessibleDescription("Free account. Add your CV or your details, then paste a job ad.");
  const check = main.getByRole("link", { name: "Check my CV in 2 minutes" });
  await expect(check).toHaveAccessibleDescription("No sign-up. Nothing is saved.");

  await check.click();
  await expect(page).toHaveURL(/\/cv-check$/);
});
