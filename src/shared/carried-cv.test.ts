import { afterEach, describe, expect, it } from "vitest";
import { carriedCv, carryCv, clearCarriedCv } from "./carried-cv";

afterEach(() => clearCarriedCv());

describe("carried CV", () => {
  it("holds the checked file until it is cleared, and reading does not clear it", () => {
    expect(carriedCv()).toBeNull();
    const file = new File(["cv"], "sara.docx");
    carryCv(file);
    expect(carriedCv()).toBe(file);
    expect(carriedCv()).toBe(file);
    clearCarriedCv();
    expect(carriedCv()).toBeNull();
  });

  it("keeps only the latest file", () => {
    carryCv(new File(["one"], "first.pdf"));
    const second = new File(["two"], "second.pdf");
    carryCv(second);
    expect(carriedCv()).toBe(second);
  });
});
