// Phone numbers on the profile: tidied into the standard UK groupings, so every CV shows them the same way.
// Only spacing changes; the digits stay exactly as the user gave them. Numbers from other countries are
// left as typed.

/**
 * "07700900101" → "07700 900101", "+44 (0)20 7946 0018" → "+44 20 7946 0018".
 * A number that isn't a UK number, or doesn't have a UK number's length, comes back trimmed and unchanged.
 */
export function tidyPhone(raw: string): string {
  const typed = raw.trim().replace(/\s+/g, " ");
  const { number, extension } = splitExtension(typed);
  const uk = readUkNumber(number);
  if (!uk) return typed;

  const groups = ukGroups(uk.national);
  // +44 drops the leading 0: "020 7946 0018" → "+44 20 7946 0018".
  const tidy = uk.international ? ["+44", groups[0].slice(1), ...groups.slice(1)].join(" ") : groups.join(" ");
  // An extension stays exactly as typed: "020 7946 0018 ext 45".
  return extension ? `${tidy} ${extension}` : tidy;
}

/** A message for the user if the number can't be right, or undefined if it looks fine (or is empty). */
export function phoneProblem(raw: string): string | undefined {
  const typed = raw.trim();
  if (!typed) return undefined;

  const message = "Check the phone number, for example 07700 900101.";
  const { number } = splitExtension(typed);
  // Digits, spaces and the usual separators only, with + at the start for a country code.
  if (!/^\+?[\d\s\-().]+$/.test(number)) return message;

  if (looksUk(number)) return readUkNumber(number) ? undefined : message;
  // Any other country, after "+" or "00": the international format allows up to 15 digits.
  const digits = compactDigits(number).replace(/^(\+|00)/, "");
  return /^\d{8,15}$/.test(digits) ? undefined : message;
}

type UkNumber = { national: string; international: boolean };

/** A UK number starts +44, 0044 or a single 0. Any other 00 is the international prefix, like +. */
function looksUk(number: string): boolean {
  const compact = compactDigits(number);
  return compact.startsWith("+44") || compact.startsWith("0044") || /^0[^0]/.test(compact);
}

/** The number in national form ("07700900101"), or null if it isn't a UK number of a valid length. */
function readUkNumber(number: string): UkNumber | null {
  const compact = compactDigits(number);
  const countryCode = /^(\+44|0044)/.exec(compact);
  // After +44 the 0 is dropped, but people often keep it: "+44 020 7946 0018".
  const national = countryCode ? `0${compact.slice(countryCode[0].length).replace(/^0/, "")}` : compact;
  const valid =
    // Most UK numbers: 0 then 10 digits.
    /^0[1-9]\d{9}$/.test(national) ||
    // Only some 01 area codes and 0800 numbers have 0 then 9 digits.
    /^01\d{8}$/.test(national) ||
    /^0800\d{6}$/.test(national);
  return valid ? { national, international: countryCode !== null } : null;
}

/** "020 7946 0018 ext 45" → the number, and "ext 45" as typed. */
function splitExtension(typed: string): { number: string; extension: string } {
  const match = /\s*\b(?:ext\.?|extension)\s*\d{1,6}$/i.exec(typed);
  if (!match) return { number: typed, extension: "" };
  return { number: typed.slice(0, match.index).trim(), extension: match[0].trim() };
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
