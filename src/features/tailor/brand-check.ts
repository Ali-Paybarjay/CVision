// The brand check for any text the app shows or the model writes: banned words and American spelling.
// Pure code with no model call, so every part of the app can run it on its output (Nazanin's quality hat):
// import { findBrandProblems } from "@/features/tailor/brand-check".
import { brand } from "@/shared/brand";

export type BrandProblem = {
  kind: "banned-phrase" | "us-spelling";
  /** The words as they appear in the text. */
  found: string;
  /** What to write instead; empty for a banned phrase, which should be rewritten. */
  suggestion: string;
};

// Common American spellings and their UK forms. Words ending in -ize/-yze are handled by a rule below.
const usToUk: Record<string, string> = {
  color: "colour",
  colors: "colours",
  colored: "coloured",
  favorite: "favourite",
  favorites: "favourites",
  behavior: "behaviour",
  behaviors: "behaviours",
  behavioral: "behavioural",
  honor: "honour",
  labor: "labour",
  neighbor: "neighbour",
  center: "centre",
  centers: "centres",
  centered: "centred",
  theater: "theatre",
  // Not "meter": in UK English a meter is a device (a gas meter), so it is often right.
  catalog: "catalogue",
  dialog: "dialogue",
  defense: "defence",
  offense: "offence",
  traveling: "travelling",
  traveled: "travelled",
  modeling: "modelling",
  modeled: "modelled",
  labeled: "labelled",
  labeling: "labelling",
  canceled: "cancelled",
  canceling: "cancelling",
  enrollment: "enrolment",
  fulfill: "fulfil",
  skillful: "skilful",
  judgment: "judgement",
  gray: "grey",
  mom: "mum",
  resume: "CV",
  résumé: "CV",
  resumes: "CVs",
  résumés: "CVs",
};

// -ize words that are spelt the same in UK English.
const izeExceptions = new Set(["prize", "prizes", "prized", "seize", "seizes", "seized", "seizing", "baize", "maize", "belize"]);
/** Any word built on "size" ("resized", "downsizing", "Oversized", "capsize") is UK English too. */
const sizeWord = /size(s|d|r|rs)?$|sizing$/;

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function keepCase(original: string, replacement: string): string {
  return original[0] === original[0].toUpperCase() && replacement !== "CV" && replacement !== "CVs"
    ? replacement[0].toUpperCase() + replacement.slice(1)
    : replacement;
}

/** Every banned brand phrase and American spelling in the text, in the order they appear. */
export function findBrandProblems(text: string): BrandProblem[] {
  const problems: { index: number; problem: BrandProblem }[] = [];

  for (const phrase of brand.bannedPhrases) {
    for (const match of text.matchAll(new RegExp(`\\b${escape(phrase)}\\b`, "gi"))) {
      problems.push({ index: match.index, problem: { kind: "banned-phrase", found: match[0], suggestion: "" } });
    }
  }

  for (const match of text.matchAll(/[\p{L}]+/gu)) {
    const word = match[0];
    const lower = word.toLowerCase();
    let uk: string | undefined = usToUk[lower];
    // "resume" is also a verb ("resume work"); only flag it when it reads as a document.
    if ((lower === "resume" || lower === "resumes") && !/\b(my|your|a|the|his|her|their)\s+$/i.test(text.slice(0, match.index))) {
      uk = undefined;
    }
    if (!uk && !izeExceptions.has(lower) && !sizeWord.test(lower)) {
      const ize = lower.match(/^(.{3,})(iz|yz)(e|es|ed|ing|ation|ations|er|ers)$/);
      if (ize) uk = `${ize[1]}${ize[2] === "iz" ? "is" : "ys"}${ize[3]}`;
    }
    if (uk) problems.push({ index: match.index, problem: { kind: "us-spelling", found: word, suggestion: keepCase(word, uk) } });
  }

  return problems.sort((a, b) => a.index - b.index).map((item) => item.problem);
}
