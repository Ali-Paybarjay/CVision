import { expect, test, type Locator, type Page } from "@playwright/test";

// The dashboard's tracker on a phone with no accounts: Sara's sample applications, dated for today, so two rows
// always have no news for 60 days or more (src/features/tracker/sample.ts). Sample changes stay on the page.

/** A row in the tracker, found by its job title. */
function trackerRow(page: Page, title: string): Locator {
  return page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
}

/** Does `act`, then checks `done`. A control used before the page's script has loaded changes nothing, so try again. */
async function untilItTakes(act: () => Promise<void>, done: () => Promise<void>) {
  await expect(async () => {
    await act();
    await done();
  }).toPass({ timeout: 30_000 });
}

test("closing applications with no news closes only the ticked ones (#69)", async ({ page }) => {
  await page.goto("/dashboard");
  const suggestion = page.getByRole("region", { name: "No news for 60 days or more" });
  const junior = suggestion.getByRole("checkbox", { name: /^Junior Business Analyst Irk Valley Foods/ });
  const dataAnalyst = suggestion.getByRole("checkbox", { name: /^Data Analyst Etherow Freight/ });
  const close = suggestion.getByRole("button", { name: /as No response$/ });

  // Nothing is ticked at first, so the button cannot close anything yet.
  await expect(junior).not.toBeChecked();
  await expect(dataAnalyst).not.toBeChecked();
  await expect(close).toBeDisabled();

  await untilItTakes(
    async () => {
      await junior.setChecked(false);
      await junior.setChecked(true);
    },
    () => expect(close).toHaveText("Close 1 as No response", { timeout: 1_000 }),
  );
  await close.click();

  // The focus goes to what happened, not back to the top of the page.
  const message = page.getByRole("status").filter({ hasText: "Closed 1 application as No response." });
  await expect(message).toBeFocused();
  await expect(message).toHaveText("Closed 1 application as No response. It is now under Closed, below your open applications.");

  // The ticked row is closed today and sits under Closed.
  const closed = page.getByRole("list", { name: /^Closed \(\d+\)$/ });
  await expect(trackerRow(page, "Junior Business Analyst")).toContainText("Closed on");
  await expect(closed.getByRole("heading", { name: "Junior Business Analyst", exact: true })).toBeVisible();
  await expect(junior).toHaveCount(0);

  // The row left unticked is still open and still offered, unticked.
  await expect(trackerRow(page, "Data Analyst")).toContainText("Applied on");
  await expect(closed.getByRole("heading", { name: "Data Analyst", exact: true })).toHaveCount(0);
  await expect(dataAnalyst).toBeVisible();
  await expect(dataAnalyst).not.toBeChecked();
  await expect(close).toHaveText("Close as No response");
});

test("a row saved with the keyboard keeps the focus where it is (#154)", async ({ page }) => {
  await page.goto("/dashboard");
  const row = trackerRow(page, "Data Analyst");
  const nextStep = row.getByLabel("Next step");
  const save = row.getByRole("button", { name: "Save" });

  await untilItTakes(
    async () => {
      await nextStep.fill("");
      await nextStep.fill("Email the hiring manager on Monday");
    },
    () => expect(save).toBeEnabled({ timeout: 1_000 }),
  );
  await save.focus();
  await page.keyboard.press("Enter");

  // The button has nothing left to save, so the focus moves to the row's message, not back to the top of the page.
  // Taking the focus reads it out, so the status line stays empty rather than read it a second time.
  await expect(row.getByText("Saved", { exact: true })).toBeFocused();
  await expect(row.getByRole("status")).toBeEmpty();
  await expect(save).toBeDisabled();
  await expect(nextStep).toHaveValue("Email the hiring manager on Monday");
  // The keyboard carries on from the same row: back past the disabled button to the field just saved.
  await page.keyboard.press("Shift+Tab");
  await expect(nextStep).toBeFocused();

  // Saved with Enter in the field, the focus stays there and the status line says it.
  await nextStep.fill("Email the hiring manager on Tuesday");
  await page.keyboard.press("Enter");
  await expect(row.getByRole("status")).toHaveText("Saved");
  await expect(nextStep).toBeFocused();
});

test("a row closed from its own form moves under Closed and keeps the focus", async ({ page }) => {
  await page.goto("/dashboard");
  const row = trackerRow(page, "Reporting Analyst");
  const save = row.getByRole("button", { name: "Save" });

  await untilItTakes(
    async () => {
      await row.getByLabel("Status").selectOption("Ready to apply");
      await row.getByLabel("Status").selectOption("Withdrawn");
    },
    () => expect(save).toBeEnabled({ timeout: 1_000 }),
  );
  await save.click();

  const closed = page.getByRole("list", { name: /^Closed \(\d+\)$/ });
  await expect(closed.getByRole("heading", { name: "Reporting Analyst", exact: true })).toBeVisible();
  await expect(row.getByRole("status")).toHaveText("Saved and moved to Closed");
  await expect(row.getByRole("status")).toBeFocused();
  await expect(row).toContainText("Withdrawn on");
});
