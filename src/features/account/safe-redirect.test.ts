import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./safe-redirect";

const request = "https://cvision-eta.vercel.app/auth/confirm?code=abc";

describe("safeRedirectPath", () => {
  it.each([
    ["/dashboard", "/dashboard"],
    ["/profile?step=2", "/profile?step=2"],
    [null, "/dashboard"],
    ["", "/dashboard"],
  ])("keeps %j on this site as %j", (next, expected) => {
    expect(safeRedirectPath(next, request)).toBe(expected);
  });

  it.each(["/\\evil.com", "/\t/evil.com", "//evil.com", "https://evil.com/dashboard", "javascript:alert(1)"])(
    "sends %j back to the dashboard instead of another site",
    (next) => {
      expect(safeRedirectPath(next, request)).toBe("/dashboard");
    },
  );
});
