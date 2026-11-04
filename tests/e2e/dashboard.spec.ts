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

/** Presses `button` with the keyboard until the page's script has loaded and `done` holds. */
async function pressUntil(button: Locator, done: () => Promise<void>) {
  await untilItTakes(async () => {
    await button.focus({ timeout: 1_000 });
    await button.press("Enter", { timeout: 1_000 });
  }, done);
}

test("a row's next step is read-only until Edit, and the keyboard keeps its place (#154, #210, #211)", async ({ page }) => {
  await page.goto("/dashboard");
  const row = trackerRow(page, "Data Analyst");
  const status = row.getByLabel("Status");
  const nextStep = row.getByLabel("Next step");
  const when = row.getByLabel("When");
  const saved = row.getByText("Saved", { exact: true });
  const edit = row.getByRole("button", { name: "Edit Data Analyst at Etherow Freight" });

  // No form until Edit: the row says it has no next step yet, with a button to add one.
  await expect(row).toContainText("No next step yet");
  await expect(nextStep).toHaveCount(0);
  await pressUntil(row.getByRole("button", { name: "Add a next step for Data Analyst at Etherow Freight" }), () =>
    expect(status).toBeFocused({ timeout: 1_000 }),
  );

  // The When menu comes once a next step is written. Saved from the Save button, the form closes and the focus moves
  // to the row's message, which reads it out, so the status line stays empty rather than read it a second time.
  await page.keyboard.press("Tab");
  await expect(nextStep).toBeFocused();
  await expect(when).toHaveCount(0);
  await page.keyboard.type("Email the hiring manager on Monday");
  const inTwoDays = when.locator("option", { hasText: /^In 2 days · / });
  const day = (await inTwoDays.textContent())?.split(" · ")[1];
  await when.selectOption((await inTwoDays.getAttribute("value")) ?? "");
  await row.getByRole("button", { name: "Save" }).focus();
  await page.keyboard.press("Enter");
  await expect(saved).toBeFocused();
  await expect(row.getByRole("status")).toBeEmpty();
  await expect(nextStep).toHaveCount(0);
  await expect(row).toContainText("Next step: Email the hiring manager on Monday");
  await expect(row).toContainText(`By ${day}`);

  // The keyboard carries on from the same row: back to Edit, which opens the form on its first field.
  await page.keyboard.press("Shift+Tab");
  await expect(edit).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(status).toBeFocused();
  await expect(saved).toHaveCount(0);

  // Enter in Next step saves too. The field has gone, so the focus moves to the message, and the date is kept.
  await page.keyboard.press("Tab");
  await nextStep.fill("Email the hiring manager on Tuesday");
  await page.keyboard.press("Enter");
  await expect(saved).toBeFocused();
  await expect(row.getByRole("status")).toBeEmpty();
  await expect(row).toContainText("Next step: Email the hiring manager on Tuesday");
  await expect(row).toContainText(`By ${day}`);

  // Escape and Cancel save nothing, close the form and put the focus back on Edit.
  await edit.focus();
  await page.keyboard.press("Enter");
  await nextStep.fill("Something else");
  await page.keyboard.press("Escape");
  await expect(edit).toBeFocused();
  await expect(nextStep).toHaveCount(0);
  await page.keyboard.press("Enter");
  await nextStep.fill("Something else");
  await row.getByRole("button", { name: "Cancel" }).focus();
  await page.keyboard.press("Enter");
  await expect(edit).toBeFocused();
  await expect(row).toContainText("Next step: Email the hiring manager on Tuesday");
  await expect(saved).toHaveCount(0);
});

test("an overdue next step keeps its date when only the status is saved (#211)", async ({ page }) => {
  await page.goto("/dashboard");
  const row = trackerRow(page, "Graduate Data Analyst");
  const status = row.getByLabel("Status");
  const when = row.getByLabel("When");

  // Sara's sample always shows one next step due tomorrow and one overdue, in words.
  await expect(trackerRow(page, "Junior Data Analyst")).toContainText("Due tomorrow");
  const overdue = await row.getByText(/^Overdue\. It was due \w{3} \d{1,2} \w{3}\.$/).textContent();
  const day = overdue?.match(/due (.+)\.$/)?.[1];

  // The saved date is not in the two weeks ahead, so the menu keeps it, chosen.
  await pressUntil(row.getByRole("button", { name: "Edit Graduate Data Analyst at Irwell Energy" }), () =>
    expect(status).toBeFocused({ timeout: 1_000 }),
  );
  await expect(when.locator("option:checked")).toHaveText(`Keep · ${day}`);
  await status.selectOption("Interview");
  await row.getByRole("button", { name: "Save" }).click();

  await expect(row.getByText("Saved", { exact: true })).toBeVisible();
  await expect(row).toContainText("Interview stage since");
  await expect(row.getByText(overdue ?? "")).toBeVisible();
});

test("a row closed from its own form moves under Closed and keeps the focus", async ({ page }) => {
  await page.goto("/dashboard");
  const row = trackerRow(page, "Reporting Analyst");
  const status = row.getByLabel("Status");
  const save = row.getByRole("button", { name: "Save" });

  await pressUntil(row.getByRole("button", { name: "Edit Reporting Analyst at Medlock Housing Partnership" }), () =>
    expect(status).toBeFocused({ timeout: 1_000 }),
  );
  await status.selectOption("Withdrawn");
  await save.focus();
  await page.keyboard.press("Enter");

  const closed = page.getByRole("list", { name: /^Closed \(\d+\)$/ });
  await expect(closed.getByRole("heading", { name: "Reporting Analyst", exact: true })).toBeVisible();
  await expect(row.getByRole("status")).toHaveText("Saved and moved to Closed");
  await expect(row.getByRole("status")).toBeFocused();
  await expect(row).toContainText("Withdrawn on");
});

test("a row's Job ad link opens the full ad on its own page (#208)", async ({ page }) => {
  await page.goto("/dashboard");
  const row = trackerRow(page, "Junior Data Analyst");

  // Only rows whose job has an ad to show get the link, and the ad itself stays off the dashboard.
  await expect(trackerRow(page, "Reporting Analyst").getByRole("link", { name: /^Job ad/ })).toHaveCount(0);
  await expect(page.getByText("You will write SQL to pull data from our warehouse")).toHaveCount(0);
  // Sample rows have no saved practice, so no Interview report link, and the interview row keeps its practice button
  // (the report link is tested in application-list.test.tsx).
  await expect(page.getByRole("link", { name: /^Interview report/ })).toHaveCount(0);
  await expect(row.getByRole("link", { name: "Start interview practice for Junior Data Analyst at Pennine Health Analytics" })).toHaveAttribute(
    "href",
    "/interview?job=sara-job-1",
  );

  await row.getByRole("link", { name: "Job ad for Junior Data Analyst at Pennine Health Analytics" }).click();
  await expect(page).toHaveURL(/\/dashboard\/jobs\/sara-job-1$/);
  await expect(page.getByRole("heading", { level: 1, name: "Junior Data Analyst" })).toBeVisible();
  await expect(page.getByRole("main")).toContainText("Pennine Health Analytics");
  await expect(page.getByRole("article", { name: "Job ad" })).toContainText("You will write SQL to pull data from our warehouse");

  // Back on the dashboard, the row's next step and its Edit button are as they were.
  await page.getByRole("link", { name: "Back to your dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(row).toContainText("Interview stage since");
  await expect(row).toContainText("Next step: Prepare for the interview questions");
  await expect(row.getByRole("button", { name: "Edit Junior Data Analyst at Pennine Health Analytics" })).toBeVisible();
});

// Another user's job needs row-level security, so the unit tests in job-ad.test.tsx cover it.
for (const jobId of ["no-such-job", "reza-job-1"]) {
  test(`the sample job ad page is not found for ${jobId}, only for Sara's two jobs (#208)`, async ({ page }) => {
    await page.goto(`/dashboard/jobs/${jobId}`);

    await expect(page.getByRole("heading", { level: 1, name: "We could not find this job ad" })).toBeVisible();
    await expect(page.getByRole("article", { name: "Job ad" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Back to your dashboard" })).toHaveAttribute("href", "/dashboard");
  });
}
