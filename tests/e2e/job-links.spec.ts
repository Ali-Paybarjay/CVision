import { expect, test } from "@playwright/test";

// A link to a job that isn't there (an old bookmark, a mistyped id) says so and offers the user's jobs, on Tailor and on
// Interview, instead of quietly opening another job (Nazanin's note on #93). Mock mode, no accounts: the sample jobs.
// The first open of a page on the dev server compiles it, hence the long waits.
test.setTimeout(300_000);

for (const page of ["/tailor", "/interview"] as const) {
  test(`${page} says a job that isn't there can't be found, and lists the jobs there are`, async ({ page: tab }) => {
    await tab.goto(`${page}?job=no-such-job`);

    await expect(tab.getByText("We could not find this job")).toBeVisible({ timeout: 120_000 });
    await expect(tab.getByText("Choose one of your jobs below.")).toBeVisible();
    // Nothing of the sample job the link didn't name.
    await expect(tab.getByRole("heading", { name: /Junior Data Analyst/ })).toHaveCount(0);
  });
}
