import { expect, test } from "@playwright/test";

// A wrong address shows CVision's own not-found page (#508): inside the header and footer, with a way on, on the
// Canvas. Next's default page painted the body white, and pure black in dark mode, which the brand rules out.

const canvas = { light: "rgb(242, 245, 249)", dark: "rgb(11, 23, 36)" } as const;

for (const colorScheme of ["light", "dark"] as const) {
  test(`a wrong address shows CVision's not-found page on the Canvas (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    const response = await page.goto("/no-such-page");

    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "We could not find this page" })).toBeVisible();
    await expect(page.getByRole("banner")).toBeVisible();
    const main = page.getByRole("main");
    await expect(main.getByRole("link", { name: "Go to the home page" })).toHaveAttribute("href", "/");
    await expect(main.getByRole("link", { name: "Go to your dashboard" })).toHaveAttribute("href", "/dashboard");
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(canvas[colorScheme]);
  });
}
