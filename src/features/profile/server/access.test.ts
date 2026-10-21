import { describe, expect, it } from "vitest";
import { modelAccessFor } from "./access";

describe("modelAccessFor", () => {
  it("counts a signed-in user's requests against their own daily limit", () => {
    expect(modelAccessFor({ id: "user-1" }, "live")).toEqual({ allowed: true, requester: { userId: "user-1" } });
    expect(modelAccessFor({ id: "user-1" }, "mock")).toEqual({ allowed: true, requester: { userId: "user-1" } });
  });

  it("keeps signed-out visitors away from the model in live mode", () => {
    expect(modelAccessFor(null, "live")).toEqual({ allowed: false });
  });

  it("keeps the demo open in mock mode, where no model is called", () => {
    expect(modelAccessFor(null, "mock")).toEqual({ allowed: true, requester: undefined });
  });
});
