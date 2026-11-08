import { expect, test } from "@playwright/test";

// The review step on a phone, with mock AI: a line that looks mistyped gets a warning under its box while the user
// types, and the warning goes once the line is right. It never stops approval, because only the user knows what
// they meant (You approve everything).
test.setTimeout(300_000);

test("a mistyped line gets a warning under its box, and the profile can still be approved", async ({ page }) => {
  await page.goto("/profile");
  await page.getByLabel("Your CV", { exact: true }).setInputFiles("sample-data/cvs/sara.docx");
  await page.getByLabel("I agree that CVision reads my CV to build my profile.").check();
  await page.getByRole("button", { name: "Read my CV" }).click();
  await expect(page.getByRole("heading", { name: "Check your details" })).toBeVisible({ timeout: 120_000 });

  const results = page.getByLabel("Results and achievements").first();
  // Only the warning's title is live: the line it quotes changes at every key (#368).
  const warning = page.getByRole("status").filter({ hasText: "This line looks mistyped" });
  await expect(warning).toHaveCount(0);

  // A backslash and letters typed with the Persian keyboard still on, inside one of Sara's results.
  const lines = await results.inputValue();
  const typo = lines.replace("cutting preparation time", "cutting preparation\\xsax شسزشسزشسز time");
  await results.fill(typo);
  await expect(warning).toBeVisible();
  await expect(warning).toHaveText("This line looks mistyped");
  await expect(page.getByRole("status").filter({ hasText: "preparation" })).toHaveCount(0);
  await expect(results).toHaveAccessibleDescription(/This line looks mistyped.*preparation\\xsax شسزشسزشسز time/);

  await results.fill(lines);
  await expect(warning).toHaveCount(0);

  await results.fill(typo);
  await page.getByRole("button", { name: "Approve and save" }).click();
  await expect(page.getByText("Your profile is saved.")).toBeVisible();
});
