import { describe, expect, it } from "vitest";
import { MAX_REQUIREMENTS } from "@/features/profile/job-extraction";
import { approvedOnly, MAX_ANSWERS, MAX_CHANGES } from "@/features/tailor/types";

describe("tailor limits after #397 (Ali's review of #408)", () => {
  it("takes an answer for every gap the job reader can keep", () => {
    expect(MAX_ANSWERS).toBeGreaterThanOrEqual(MAX_REQUIREMENTS);
  });

  it("takes more approved changes than one CV ever gets", () => {
    expect(MAX_CHANGES).toBeGreaterThanOrEqual(200);
  });

  it("sends only the approved changes to the letter and the download", () => {
    const changes = [
      { id: "a", status: "approved" },
      { id: "b", status: "rejected" },
      { id: "c", status: "proposed" },
      { id: "d", status: "approved" },
    ];
    expect(approvedOnly(changes).map((change) => change.id)).toEqual(["a", "d"]);
  });
});
