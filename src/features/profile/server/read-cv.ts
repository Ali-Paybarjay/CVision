import "server-only";
import { cvFileMessages, MAX_CV_BYTES } from "../cv-limits";
import { extractDocxText } from "./docx";
import { extractPdfText, PdfTooSlowError } from "./pdf";

export { cvFileMessages, MAX_CV_BYTES };

/** About 7,500 words: far more than any CV, and a cap on what one request can cost. */
export const MAX_CV_CHARACTERS = 30_000;
/** How much text is read from a file and tidied. Tidying mostly removes spaces, so twice the final cap is plenty. */
const MAX_RAW_CHARACTERS = MAX_CV_CHARACTERS * 2;
/** Less text than this is not a CV: usually a scanned image with no text layer. */
const MIN_CV_LETTERS = 40;

export type CvFormat = "pdf" | "docx";

export type CvFileErrorCode =
  | "missing"
  | "empty"
  | "too-large"
  | "wrong-type"
  | "password"
  | "unreadable"
  | "too-slow"
  | "no-text";

/** A problem with the uploaded file that the user can fix. The message is written for them. */
export class CvFileError extends Error {
  constructor(
    readonly code: CvFileErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CvFileError";
  }
}

export type CvText = {
  text: string;
  format: CvFormat;
  /** True when the CV was longer than MAX_CV_CHARACTERS and only the start was kept. */
  truncated: boolean;
};

/** Checks an uploaded CV and reads its text. Throws a CvFileError the user can act on. */
export async function readCvText(file: { name: string; bytes: Uint8Array }): Promise<CvText> {
  const { name, bytes } = file;
  if (bytes.length === 0) throw new CvFileError("empty", cvFileMessages.empty);
  if (bytes.length > MAX_CV_BYTES) throw new CvFileError("too-large", cvFileMessages.tooLarge);

  const format = detectCvFormat(bytes);
  if (format === "office-legacy") {
    // Old .doc files and password-protected .docx files are both stored in this older container.
    throw name.toLowerCase().endsWith(".docx")
      ? new CvFileError("password", cvFileMessages.password)
      : new CvFileError("wrong-type", cvFileMessages.oldWord);
  }
  if (format === null) throw new CvFileError("wrong-type", cvFileMessages.wrongType);

  let raw: string;
  try {
    raw = format === "pdf" ? await extractPdfText(bytes, { maxCharacters: MAX_RAW_CHARACTERS }) : extractDocxText(bytes);
  } catch (error) {
    if (error instanceof Error && error.name === "PasswordException") {
      throw new CvFileError("password", cvFileMessages.password);
    }
    if (error instanceof PdfTooSlowError) throw new CvFileError("too-slow", cvFileMessages.tooSlow);
    throw new CvFileError("unreadable", cvFileMessages.unreadable);
  }

  // Only the start of a very long file is tidied: the rest would be cut anyway.
  const cut = raw.length > MAX_RAW_CHARACTERS;
  const text = cleanCvText(cut ? raw.slice(0, MAX_RAW_CHARACTERS) : raw);
  if ((text.match(/\p{L}/gu)?.length ?? 0) < MIN_CV_LETTERS) {
    throw new CvFileError("no-text", cvFileMessages.noText);
  }

  return cut || text.length > MAX_CV_CHARACTERS
    ? { text: text.slice(0, MAX_CV_CHARACTERS), format, truncated: true }
    : { text, format, truncated: false };
}

/** Tells the format from the file's first bytes, not its name, which anyone can change. */
export function detectCvFormat(bytes: Uint8Array): CvFormat | "office-legacy" | null {
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return "docx";
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return "office-legacy";
  // "%PDF-" should come first, but readers accept it anywhere in the first kilobyte.
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  if (head.includes("%PDF-")) return "pdf";
  return null;
}

/** Tidies extracted text: one kind of space and line break, no invisible characters, no long gaps. */
export function cleanCvText(raw: string): string {
  return (
    raw
      // Splits ligatures such as "ﬁ" (common in PDFs) into plain letters.
      .normalize("NFKC")
      .replace(/\r\n?/g, "\n")
      .replace(/[​-‍⁠﻿­]/g, "")
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
      .replace(/[^\S\n\t]+/g, " ")
      .split("\n")
      .map((line) => line.replace(/ *\t[\t ]*/g, "\t").trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}
