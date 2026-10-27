// What a CV upload and a profile may be. Shared by the profile page (to warn early) and the server (which decides).

/** Kept under Vercel's 4.5 MB request limit, with room for the form around the file. */
export const MAX_CV_BYTES = 4 * 1024 * 1024;

/** For the file picker. The server checks the file's contents, not its name. */
export const ACCEPTED_CV_FILES =
  ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const cvFileMessages = {
  missing: "Choose your CV file to upload.",
  empty: "This file is empty. Choose your CV and try again.",
  tooLarge: "This file is over 4 MB. Save a smaller copy, for example without photos, and try again.",
  wrongType: "Upload your CV as a PDF or a Word (.docx) file.",
  oldWord: "This is an older Word file (.doc). Save it as .docx or PDF, then upload it again.",
  password: "This file is password-protected. Remove the password, then upload it again.",
  unreadable: "We couldn’t open this file. Check that it opens on your computer, then try again.",
  tooSlow: "This PDF takes too long to read. Upload the Word version, or save the PDF again from Word or Google Docs.",
  noText:
    "We couldn’t find any text in this file. If it is a scanned image, upload the Word version, or a PDF saved from Word or Google Docs.",
} as const;

/**
 * Well above any real profile: a CV is cut at 30,000 characters before it becomes one, and answers are short.
 * A profile typed in by hand has no such cut, so the review page checks it before the server refuses it.
 */
export const MAX_PROFILE_CHARACTERS = 60_000;

/** True when a profile, written out as it is sent, is within MAX_PROFILE_CHARACTERS. */
export function fitsProfileLimit(value: unknown): boolean {
  try {
    return (JSON.stringify(value) ?? "").length <= MAX_PROFILE_CHARACTERS;
  } catch {
    // Not plain data (a loop, for example), so not a profile either.
    return false;
  }
}

/** For a profile over MAX_PROFILE_CHARACTERS: the review page and the server both say it. */
export const profileTooLongMessage = "Your profile is too long to save. Shorten the longest sections, then try again.";
