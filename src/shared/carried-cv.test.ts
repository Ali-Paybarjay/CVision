import { afterEach, describe, expect, it, vi } from "vitest";
import { carriedCvFor, carryCheckedCv, clearCarriedCv, subscribeCarriedCv } from "./carried-cv";

afterEach(() => clearCarriedCv());

const cv = (name = "sara.docx") => new File(["cv"], name);

describe("carried CV", () => {
  it("is kept for the account that checked it, and reading it changes nothing", () => {
    const file = cv();
    carryCheckedCv(file, "account-a");
    expect(carriedCvFor("account-a")).toBe(file);
    expect(carriedCvFor("account-a")).toBe(file);
  });

  // Sign-out in another tab, or an ended session, doesn't reload this tab (#336, end-of-batch review).
  it("is never given to another account", () => {
    carryCheckedCv(cv(), "account-a");
    expect(carriedCvFor("account-b")).toBeNull();
  });

  it("forgets an earlier file when a check has no file or no account to carry it for", () => {
    carryCheckedCv(cv("first.pdf"), "account-a");
    carryCheckedCv(null, "account-a");
    expect(carriedCvFor("account-a")).toBeNull();

    carryCheckedCv(cv("first.pdf"), "account-a");
    carryCheckedCv(cv("visitor.pdf"), null);
    expect(carriedCvFor("account-a")).toBeNull();
  });

  it("keeps only the latest file, and can be cleared", () => {
    carryCheckedCv(cv("first.pdf"), "account-a");
    const second = cv("second.pdf");
    carryCheckedCv(second, "account-a");
    expect(carriedCvFor("account-a")).toBe(second);
    clearCarriedCv();
    expect(carriedCvFor("account-a")).toBeNull();
  });

  // Profile subscribes, so a page Next keeps alive shows the latest file and loses a cleared one at once.
  it("tells subscribers when the file changes, until they unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeCarriedCv(listener);
    carryCheckedCv(cv(), "account-a");
    clearCarriedCv();
    clearCarriedCv(); // nothing to clear: no call
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    carryCheckedCv(cv(), "account-a");
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
