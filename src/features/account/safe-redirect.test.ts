import { describe, expect, it } from "vitest";
import { safeRedirectPath, withNext } from "./safe-redirect";

describe("safeRedirectPath", () => {
  it.each([
    ["/dashboard", "/dashboard"],
    ["/profile?step=2", "/profile?step=2"],
    ["/interview?job=0b6f2d3e-6a51-4c1e-9d6e-2f6c1a7b9e10", "/interview?job=0b6f2d3e-6a51-4c1e-9d6e-2f6c1a7b9e10"],
    ["/tailor?job=1&step=cv", "/tailor?job=1&step=cv"],
    ["/%2F%2Fevil.com", "/%2F%2Fevil.com"],
  ])("keeps %j on this site as %j", (next, expected) => {
    expect(safeRedirectPath(next)).toBe(expected);
  });

  it.each([null, undefined, "", ["/profile", "/jobs"]])("sends %j to the dashboard", (next) => {
    expect(safeRedirectPath(next)).toBe("/dashboard");
  });

  it.each([
    "//evil.com",
    "///evil.com",
    "/\\evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    "\\\\evil.com",
    "https://evil.com/dashboard",
    "HTTPS://evil.com",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "evil.com",
    "dashboard",
    " /dashboard",
  ])("sends %j back to the dashboard instead of another site", (next) => {
    expect(safeRedirectPath(next)).toBe("/dashboard");
  });

  it("uses the given fallback", () => {
    expect(safeRedirectPath("//evil.com", "/")).toBe("/");
  });
});

describe("withNext", () => {
  it("adds the return address, encoded so its own query survives", () => {
    const href = withNext("/sign-in", "/interview?job=1&step=2");
    expect(href).toBe("/sign-in?next=%2Finterview%3Fjob%3D1%26step%3D2");
    expect(new URL(href, "https://example.com").searchParams.get("next")).toBe("/interview?job=1&step=2");
  });

  it("leaves the default destination out", () => {
    expect(withNext("/sign-up", "/dashboard")).toBe("/sign-up");
  });
});
