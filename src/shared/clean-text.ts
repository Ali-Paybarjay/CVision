// Removes characters a reader cannot see but a model reads. Text copied from a job board or a file can hide an
// instruction in them, for example one that makes the tailored CV claim something the user never said.
// Pure and without "server-only", so browser code can import it too (unlike @/shared/ai).

/** How many characters of each kind cleanModelText removed or changed. */
export type HiddenCharacterCounts = {
  /** U+034F, U+180E, U+200B to U+200D and U+2060 to U+2064. */
  zeroWidth: number;
  /** U+FEFF. */
  byteOrderMark: number;
  /** U+00AD. */
  softHyphen: number;
  /**
   * Bidi marks, embeddings, overrides and isolates, Unicode's whole Bidi_Control set: U+061C, U+200E, U+200F,
   * U+202A to U+202E and U+2066 to U+2069.
   */
  bidi: number;
  /** U+E0000 to U+E007F, except inside the flags of England, Scotland and Wales. */
  tag: number;
  /** U+E0100 to U+E01EF. */
  variationSelector: number;
  /** U+115F, U+1160, U+3164 and U+FFA0: Hangul letters that stand for a missing sound and show as nothing or a blank. */
  hangulFiller: number;
  /** U+FFF9 to U+FFFB, the interlinear annotation marks: meant for use inside one app, never in text passed on. */
  annotation: number;
  /** U+2028 and U+2029: turned into "\n", not removed, so the words either side stay apart. */
  lineSeparator: number;
  /**
   * Removed characters that rarely turn up by accident: a zero-width character, U+FEFF or a Hangul filler between two
   * letters (inside a word U+FEFF is a word joiner, like U+2060), a bidi override or isolate, and every tag and
   * annotation character. Each is also counted under its own kind above. A letter may end in combining marks, as in a
   * decomposed "e" plus U+0308.
   */
  tamperSigns: number;
};

export type CleanedText = { text: string; counts: HiddenCharacterCounts };

type HiddenKind = Exclude<keyof HiddenCharacterCounts, "lineSeparator" | "tamperSigns">;

const BLACK_FLAG = "\u{1F3F4}";
const CANCEL_TAG = "\u{E007F}";

/** ASCII spelt in tag characters, the invisible letters that name a subdivision flag's region. */
function asTags(ascii: string): string {
  return Array.from(ascii, (char) => String.fromCodePoint(0xe0000 + char.charCodeAt(0))).join("");
}

/**
 * England, Scotland and Wales: the only subdivision flags in Unicode's recommended emoji set. A flag is kept only
 * when the black flag is followed by exactly these tags. With an extra tag anywhere inside it, or any other region,
 * every tag in it is removed and counted, and a plain black flag (🏴) is left.
 */
const nationFlags = ["gbeng", "gbsct", "gbwls"].map((region) => BLACK_FLAG + asTags(region) + CANCEL_TAG);

// Every character cleanModelText removes, by code point.
const hiddenClass =
  "[\\u00AD\\u034F\\u061C\\u115F\\u1160\\u180E\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u2064\\u2066-\\u2069" +
  "\\u3164\\uFEFF\\uFFA0\\uFFF9-\\uFFFB\\u{E0000}-\\u{E007F}\\u{E0100}-\\u{E01EF}]";

// One pass over the text: a whole nation flag (kept), a line or paragraph separator (one "\n"),
// or a run of hidden characters (removed). The u flag makes it step by code point, not UTF-16 unit.
const hiddenPattern = new RegExp(`(${nationFlags.join("|")})|([\\u2028\\u2029])|${hiddenClass}+`, "gu");

// Tested at a run's offset: does a letter end right there, with any combining marks that belong to it (a decomposed
// "ë" is "e" plus U+0308)? It steps back only over the characters that stay just before the run, never into an
// earlier run, so the whole pass stays linear: some hidden characters are marks (U+034F) or letters (Hangul fillers).
const stays = `(?!${hiddenClass})`;
const letterBefore = new RegExp(`(?<=${stays}\\p{L}(?:${stays}\\p{M})*)`, "uy");
const startsWithLetter = /^\p{L}/u;

/** The kind of a character hiddenPattern already matched as hidden. */
function kindOf(code: number): HiddenKind {
  if (code === 0x00ad) return "softHyphen";
  if (code === 0xfeff) return "byteOrderMark";
  if (code >= 0xe0100) return "variationSelector";
  if (code >= 0xe0000) return "tag";
  if (code >= 0xfff9) return "annotation";
  if (code === 0x115f || code === 0x1160 || code === 0x3164 || code === 0xffa0) return "hangulFiller";
  if (code === 0x034f || code === 0x180e) return "zeroWidth";
  if ((code >= 0x200b && code <= 0x200d) || (code >= 0x2060 && code <= 0x2064)) return "zeroWidth";
  return "bidi";
}

/** Bidi overrides and isolates: they can show text in another order than the one the model reads. */
function isOverrideOrIsolate(code: number): boolean {
  return code === 0x202d || code === 0x202e || (code >= 0x2066 && code <= 0x2069);
}

/**
 * Removes invisible characters from text bound for the model, turns U+2028 and U+2029 into "\n", and finishes with
 * NFC (never NFKC, which would turn ² into 2 and ™ into TM). Removing U+200D also splits emoji joined with it, such
 * as the technologist U+1F469 U+200D U+1F4BB, into their parts. One pass, so a long CV costs no more than reading it.
 */
export function cleanModelText(text: string): CleanedText {
  const counts: HiddenCharacterCounts = {
    zeroWidth: 0,
    byteOrderMark: 0,
    softHyphen: 0,
    bidi: 0,
    tag: 0,
    variationSelector: 0,
    hangulFiller: 0,
    annotation: 0,
    lineSeparator: 0,
    tamperSigns: 0,
  };

  const cleaned = text.replace(hiddenPattern, (run: string, flag: string | undefined, separator: string | undefined, offset: number) => {
    if (flag) return flag;
    if (separator) {
      counts.lineSeparator++;
      return "\n";
    }

    // Zero-width characters, U+FEFF and Hangul fillers: the ones that can split a word without a reader seeing it.
    let wordSplitters = 0;
    for (const char of run) {
      const code = char.codePointAt(0) ?? 0;
      const kind = kindOf(code);
      counts[kind]++;
      if (kind === "zeroWidth" || kind === "byteOrderMark" || kind === "hangulFiller") wordSplitters++;
      else if (kind === "tag" || kind === "annotation" || isOverrideOrIsolate(code)) counts.tamperSigns++;
    }
    // A run takes every hidden character in a row, so the characters either side of it are ones that stay.
    // Two UTF-16 units hold any one code point, even a letter outside the Basic Multilingual Plane.
    letterBefore.lastIndex = offset;
    const after = text.slice(offset + run.length, offset + run.length + 2);
    if (wordSplitters > 0 && letterBefore.test(text) && startsWithLetter.test(after)) {
      counts.tamperSigns += wordSplitters;
    }
    return "";
  });

  return { text: cleaned.normalize("NFC"), counts };
}
