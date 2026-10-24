// The data-rights pages (issue #43), in one place for the pages, the route handler and the actions.

/** See what we hold, download it or delete the account. Signing in brings a signed-out visitor back here. */
export const yourDataPath = "/dashboard/your-data";

/** Where "Download my data" posts. A failed download comes back to the page with ?download=failed. */
export const downloadPath = `${yourDataPath}/download`;

/** Where a deleted user lands: it clears this browser's CVision data and says what is not deleted straight away. */
export const accountDeletedPath = `${yourDataPath}/deleted`;
