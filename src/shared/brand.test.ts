import { describe, expect, it } from "vitest";
import { brand } from "./brand";

/** Every piece of copy in brand.ts, with the copy functions filled in with sample values. */
function copyIn(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "function") return [value("Sara Khan", "Junior Data Analyst", "Pennine Health Analytics")];
  if (Array.isArray(value)) return value.flatMap(copyIn);
  if (value && typeof value === "object") return Object.values(value).flatMap(copyIn);
  return [];
}

describe("brand copy", () => {
  const { bannedPhrases, ...copy } = brand;
  const lines = copyIn(copy);

  it("never uses a banned phrase", () => {
    for (const line of lines) {
      for (const phrase of bannedPhrases) {
        expect(line.toLowerCase(), line).not.toContain(phrase.toLowerCase());
      }
    }
  });

  it("keeps the plan to three steps and the Honest CV Promise to four promises", () => {
    expect(brand.steps).toHaveLength(3);
    expect(brand.promise.items).toHaveLength(4);
  });
});
