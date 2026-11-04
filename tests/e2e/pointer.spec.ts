import { expect, test } from "@playwright/test";

// On a computer, a button shows it can be clicked: the pointer turns into a hand, but not on a disabled one (#277).
// Tailwind 4 leaves buttons with the plain arrow, so globals.css sets it for every button.

test("buttons get the hand pointer, disabled ones keep the arrow", async ({ page }) => {
  await page.goto("/ui-kit");
  const cursor = (name: string) => page.getByRole("button", { name, exact: true }).evaluate((element) => getComputedStyle(element).cursor);

  expect(await cursor("Upload a different CV")).toBe("pointer");
  expect(await cursor("Skip this question")).toBe("pointer");
  expect(await cursor("Disabled while it works")).toBe("not-allowed");
});

test("the menu button in the header gets the hand pointer too", async ({ page }) => {
  await page.goto("/");
  const menu = page.getByRole("banner").getByRole("button", { name: "Menu" });
  expect(await menu.evaluate((element) => getComputedStyle(element).cursor)).toBe("pointer");
});
