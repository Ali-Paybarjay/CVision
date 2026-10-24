import { describe, expect, it } from "vitest";
import { phoneProblem, tidyPhone } from "./phone";

describe("tidyPhone", () => {
  it.each([
    ["07700900101", "07700 900101"],
    ["07700 900 101", "07700 900101"],
    ["07700-900-101", "07700 900101"],
    ["  07700 900101 ", "07700 900101"],
    ["+447700900101", "+44 7700 900101"],
    ["+44 (0)7700 900101", "+44 7700 900101"],
    ["0044 7700 900101", "+44 7700 900101"],
    ["02079460018", "020 7946 0018"],
    ["+44 20 79460018", "+44 20 7946 0018"],
    ["01614960000", "0161 496 0000"],
    ["01134960000", "0113 496 0000"],
    ["01632960001", "01632 960001"],
    ["03001234567", "0300 123 4567"],
    ["0800123456", "0800 123456"],
    ["0169771234", "01697 71234"],
    // #34: the 0 people keep after +44, and an extension.
    ["+44 020 7946 0123", "+44 20 7946 0123"],
    ["+44 (0) 020 7946 0123", "+44 20 7946 0123"],
    ["020 7946 0123 ext 45", "020 7946 0123 ext 45"],
    ["02079460123 Ext. 4512", "020 7946 0123 Ext. 4512"],
  ])("tidies %s into %s", (typed, tidy) => {
    expect(tidyPhone(typed)).toBe(tidy);
  });

  it("keeps the sample personas' numbers as they are", () => {
    for (const phone of ["07700 900101", "07700 900202", "07700 900303", "07700 900404"]) {
      expect(tidyPhone(phone)).toBe(phone);
    }
  });

  it("leaves numbers from other countries, and numbers it can't read, as typed", () => {
    expect(tidyPhone("+98 912 345 6789")).toBe("+98 912 345 6789");
    expect(tidyPhone("+1  (415) 555-0100")).toBe("+1 (415) 555-0100");
    expect(tidyPhone("00 98 912 345 6789")).toBe("00 98 912 345 6789");
    expect(tidyPhone("0770090010")).toBe("0770090010");
    expect(tidyPhone("0770")).toBe("0770");
    expect(tidyPhone("")).toBe("");
  });
});

describe("phoneProblem", () => {
  it.each([
    "",
    "07700 900101",
    "+44 7700 900101",
    "020 7946 0018",
    "+98 912 345 6789",
    "+1 (415) 555-0100",
    // #34
    "+44 020 7946 0123",
    "00 98 912 345 6789",
    "020 7946 0123 ext 45",
    "0800 123456",
    "01697 71234",
  ])(
    "accepts %j",
    (phone) => {
      expect(phoneProblem(phone)).toBeUndefined();
    },
  );

  it.each([
    "0770 090",
    "07700 9001011234",
    "call me",
    "07700 900101 ext",
    "12345",
    // #34: a 10-digit number is only right for some 01 numbers and 0800.
    "0770090010",
    "020 7946 012",
    "00 12",
  ])("rejects %j", (phone) => {
    expect(phoneProblem(phone)).toBe("Check the phone number, for example 07700 900101.");
  });
});
