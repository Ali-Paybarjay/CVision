// Phone numbers on the profile: tidied into the standard UK groupings, so every CV shows them the same way.
// Only spacing changes; the digits stay exactly as the user gave them. Numbers from other countries are
// left as typed.

/**
 * "07700900101" → "07700 900101", "+44 (0)20 7946 0018" → "+44 20 7946 0018".
 * A number that isn't a UK number, or doesn't have a UK number's length, comes back trimmed and unchanged.
 */
export function tidyPhone(raw: string): string {
  const typed = raw.trim().replace(/\s+/g, " ");
  const uk = readUkNumber(typed);
  if (!uk) return typed;

  const groups = ukGroups(uk.national);
  if (!uk.international) return groups.join(" ");
  // +44 drops the leading 0: "020 7946 0018" → "+44 20 7946 0018".
  return ["+44", groups[0].slice(1), ...groups.slice(1)].join(" ");
}

/** A message for the user if the number can't be right, or undefined if it looks fine (or is empty). */
export function phoneProblem(raw: string): string | undefined {
  const typed = raw.trim();
  if (!typed) return undefined;

  const message = "Check the phone number, for example 07700 900101.";
  // Digits, spaces and the usual separators only, with + at the start for a country code.
  if (!/^\+?[\d\s\-().]+$/.test(typed)) return message;

  const digits = typed.replace(/\D/g, "");
  if (looksUk(typed)) return readUkNumber(typed) ? undefined : message;
  // Any other country: the international format allows up to 15 digits.
  return digits.length >= 8 && digits.length <= 15 ? undefined : message;
}

type UkNumber = { national: string; international: boolean };

function looksUk(typed: string): boolean {
  const compact = compactDigits(typed);
  return compact.startsWith("+44") || compact.startsWith("0044") || compact.startsWith("0");
}

/** The number in national form ("07700900101"), or null if it isn't a UK number of a valid length. */
function readUkNumber(typed: string): UkNumber | null {
  const compact = compactDigits(typed);
  let national: string;
  let international = false;
  if (compact.startsWith("+44")) {
    national = `0${compact.slice(3)}`;
    international = true;
  } else if (compact.startsWith("0044")) {
    national = `0${compact.slice(4)}`;
    international = true;
  } else {
    national = compact;
  }
  // UK numbers are 0 then 9 or 10 digits, and never start 00 once the country code is gone.
  return /^0[1-9]\d{8,9}$/.test(national) ? { national, international } : null;
}

/** Removes separators, and the "(0)" people write after +44. */
function compactDigits(typed: string): string {
  return typed.replace(/\(0\)/g, "").replace(/[\s\-().]/g, "");
}

/** Ofcom's standard groupings for a national number. */
function ukGroups(national: string): string[] {
  const split = (...sizes: number[]) => {
    const parts: string[] = [];
    let at = 0;
    for (const size of sizes) {
      parts.push(national.slice(at, at + size));
      at += size;
    }
    return parts;
  };

  if (national.length === 10) {
    // A few older numbers: "01xxx xxxxx" and "0800 xxxxxx".
    return national.startsWith("01") ? split(5, 5) : split(4, 6);
  }
  // London and other 02 numbers: "020 7946 0018".
  if (national.startsWith("02")) return split(3, 4, 4);
  // Large cities ("0113", "0161") and non-geographic numbers ("0300", "0800"): "0161 496 0000".
  if (/^01(1\d|\d1)/.test(national) || /^0[389]/.test(national)) return split(4, 3, 4);
  // Mobiles and other 01 numbers: "07700 900101", "01632 960001".
  return split(5, 6);
}
