import { describe, expect, it } from "vitest";
import { signUpThenProfile } from "@/shared/navigation";
import { isNewPasswordStep, pastNewPasswordStep, safeRedirectPath, withNext } from "./safe-redirect";

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
    // Resolve to the path "//evil.com", which a browser reads as another site (found in review, 18 November).
    "/..//evil.com",
    "/.//evil.com",
    "/a/..//evil.com",
    "/%2e%2e//evil.com",
  ])("sends %j back to the dashboard instead of another site", (next) => {
    expect(safeRedirectPath(next)).toBe("/dashboard");
  });

  it("uses the given fallback", () => {
    expect(safeRedirectPath("//evil.com", "/")).toBe("/");
  });
});

describe("pastNewPasswordStep (#524)", () => {
  it.each([
    ["/sign-in/new-password?next=%2Ftailor%3Fjob%3D1", "/tailor?job=1"],
    ["/sign-in/new-password", "/dashboard"],
    ["/sign-in/new-password?next=%2Fsign-in%2Fnew-password%3Fnext%3D%252Fprofile", "/profile"],
    ["/sign-in/new-password?next=%2F%2Fevil.com", "/dashboard"],
    ["/profile", "/profile"],
    ["/sign-in?next=%2Fprofile", "/sign-in?next=%2Fprofile"],
  ])("takes %j on to %j", (next, expected) => {
    expect(pastNewPasswordStep(next)).toBe(expected);
  });

  it("knows a failed reset link by its destination", () => {
    expect(isNewPasswordStep("/sign-in/new-password?next=%2Fprofile")).toBe(true);
    expect(isNewPasswordStep("/profile")).toBe(false);
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

  // @/shared writes this one out, as it reads nothing from @/features (#507).
  it("gives the same address as signUpThenProfile in @/shared", () => {
    expect(withNext("/sign-up", "/profile")).toBe(signUpThenProfile);
  });
});
